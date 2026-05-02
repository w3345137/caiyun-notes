/**
 * 笔记状态管理 (v5 - 精简保存版)
 * 核心改动：
 * - updateNote 更新 store 后立即排队保存
 * - 同一笔记的高频保存串行化，刷新前可等待队列刷完
 * - syncToCloud 只保存当前选中页面（手动 Ctrl+S）
 * - 去掉定时保存和全量同步
 */
import { create } from 'zustand';
import { Note } from '../types';
import {
  loadFullTree, saveNoteToCloud, deleteNoteFromCloud,
  apiLockNote, apiUnlockNote, apiGetPageLock,
  saveSidebarState, loadSidebarState, apiGetNotebookInfo,
} from '../lib/edgeApi';
import { createBackup, getBackupConfig } from '../lib/localBackup';

export interface SSENotification {
  type: 'note_updated' | 'note_deleted' | 'note_locked' | 'note_unlocked';
  noteId: string;
  updatedBy?: string;
  lockedBy?: string;
  lockedByName?: string;
}

export interface NoteStore {
  // State
  notes: Note[];
  selectedNoteId: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  expandedNodes: string[];
  sidebarCollapsed: boolean;
  activeTab: string;
  searchQuery: string;
  loadingStatus: string;
  loadingProgress: number;
  dbReady: boolean;
  dbError: string | null;
  sseNotifications: SSENotification[];
  folderRefreshTrigger: number;

  // Actions
  loadFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<{ success: boolean; error?: string }>;
  hasPendingSaves: () => boolean;
  selectNote: (id: string | null) => void;
  updateNote: (id: string, updates: Partial<Note>, opts?: { silent?: boolean; save?: boolean }) => void;
  setSyncError: (err: string | null) => void;
  saveNoteById: (id: string) => Promise<void>;
  addNote: (parentId: string | null, type?: string, title?: string, opts?: { skipSelect?: boolean }) => string;
  deleteNote: (id: string) => Promise<{ success?: boolean; error?: string } | undefined>;
  toggleExpanded: (id: string) => void;
  reorderPages: (parentId: string, newOrderIds: string[]) => void;
  reorderSections: (parentId: string, newOrderIds: string[]) => void;
  lockNote: (noteId: string, userId: string, userName: string) => Promise<{ success?: boolean; error?: string }>;
  unlockNote: (noteId: string) => Promise<{ success?: boolean; error?: string }>;
  isNoteLockedByOther: (noteId: string, userId: string) => boolean;
  clearLocalCache: () => void;
  getNoteById: (id: string) => Note | undefined;
  setSidebarCollapsed: (v: boolean) => void;
  setActiveTab: (v: string) => void;
  setSearchQuery: (v: string) => void;
  isNoteEditing: (noteId: string) => boolean;
  upsertNote: (note: Record<string, unknown>) => void;
  fetchAndUpsertNote: (noteId: string) => Promise<void>;
  removeNoteFromStore: (noteId: string) => void;
  updateNoteLock: (noteId: string, isLocked: boolean, lockedBy: string | null, lockedByName: string | null) => void;
  addSSENotification: (notification: SSENotification) => void;
  clearSSENotifications: (noteId?: string) => void;
  triggerFolderRefresh: () => void;
}

// === 全局缓存 ===
let _updateLogsCache: any[] = [];
const _editingNotes = new Set<string>();

// 编辑量追踪：记录每个笔记未保存的编辑次数
const _editCounters = new Map<string, number>();

// 云端保存 debounce：用于排序这类高频批量操作
const _saveTimers = new Map<string, NodeJS.Timeout>();
const _debouncedSaveNotes = new Map<string, Note>();
const _pendingSaves = new Map<string, Note>();
const _activeSavePromises = new Map<string, Promise<void>>();

function sanitizeNote(n: any): Note {
  if (!n) return {} as Note;
  const parentId = n.parentId || n.parent_id || null;
  const order = n.order ?? n.order_index ?? 0;
  const createdAt = n.created_at || n.createdAt || new Date().toISOString();
  const updatedAt = n.updatedAt || n.updated_at || new Date().toISOString();
  const ownerId = n.owner_id || n.ownerId || '';
  const lockedBy = n.lockedBy || n.locked_by || null;
  const lockedByName = n.lockedByName || n.locked_by_name || null;
  const lockedAt = n.lockedAt || n.locked_at || null;
  const isLocked = n.is_locked || n.isLocked || false;
  const rootNotebookId = n.rootNotebookId || n.root_notebook_id || '';

  return {
    ...n,
    id: n.id || `gen-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    title: n.title || '无标题',
    content: n.content || '',
    type: n.type || 'page',
    parent_id: parentId,
    parentId,
    owner_id: ownerId,
    ownerId,
    order_index: order,
    order,
    icon: n.icon || '',
    tag: n.tag || n.tags?.[0] || '',
    created_at: createdAt,
    createdAt,
    updated_at: updatedAt,
    updatedAt,
    locked_by: lockedBy,
    lockedBy,
    locked_by_name: lockedByName,
    lockedByName,
    locked_at: lockedAt,
    lockedAt,
    is_locked: isLocked,
    isLocked,
    version: n.version || 1,
    root_notebook_id: rootNotebookId,
    rootNotebookId,
    createdBy: n.createdBy || n.created_by || '',
    createdByName: n.createdByName || n.created_by_name || '',
    updatedBy: n.updatedBy || n.updated_by || '',
    updatedByName: n.updatedByName || n.updated_by_name || '',
  };
}

/**
 * 立即保存单个笔记到云端
 */
async function saveSingleNote(note: Note) {
  try {
    const result = await saveNoteToCloud(note);
    if (result && !result.success) {
      throw new Error(result.error || '保存失败');
    }
    console.log(`[Store] 云端保存成功: ${note.id.substring(0, 12)}...`);
    return result;
  } catch (e) {
    console.error(`[Store] 云端保存失败: ${note.id}`, e);
    throw e;
  }
}

async function queueCloudSave(note: Note) {
  _pendingSaves.set(note.id, note);

  const active = _activeSavePromises.get(note.id);
  if (active) return active;

  const promise = (async () => {
    try {
      while (_pendingSaves.has(note.id)) {
        const latest = _pendingSaves.get(note.id)!;
        _pendingSaves.delete(note.id);
        await saveSingleNote(latest);
      }
    } finally {
      _activeSavePromises.delete(note.id);
    }
  })();

  _activeSavePromises.set(note.id, promise);
  return promise;
}

async function flushCloudSaves(note?: Note) {
  if (note) {
    _pendingSaves.set(note.id, note);
  }

  for (const [id, timer] of _saveTimers) {
    clearTimeout(timer);
    _saveTimers.delete(id);
    const delayedNote = _debouncedSaveNotes.get(id);
    _debouncedSaveNotes.delete(id);
    if (delayedNote) {
      _pendingSaves.set(id, delayedNote);
    }
  }

  const ids = new Set([..._pendingSaves.keys(), ..._activeSavePromises.keys()]);
  await Promise.all(Array.from(ids).map((id) => {
    const pending = _pendingSaves.get(id);
    if (pending) {
      return queueCloudSave(pending);
    }
    return _activeSavePromises.get(id);
  }).filter(Boolean) as Promise<void>[]);
}

/**
 * debounce 保存单个笔记（2秒内同一笔记只保存一次）
 */
function debouncedCloudSave(note: Note) {
  const id = note.id;
  if (_saveTimers.has(id)) {
    clearTimeout(_saveTimers.get(id)!);
  }
  _debouncedSaveNotes.set(id, note);
  _saveTimers.set(id, setTimeout(async () => {
    _saveTimers.delete(id);
    const latest = _debouncedSaveNotes.get(id) || note;
    _debouncedSaveNotes.delete(id);
    await queueCloudSave(latest);
  }, 2000));
}

/**
 * 创建本地备份（如果已开启）
 */
async function tryCreateBackup(note: Note) {
  try {
    const config = getBackupConfig();
    if (!config.enabled) return;
    if (note.type !== 'page') return;
    const content = note.content || '';
    if (typeof content !== 'string' || content.length < 50) return;
    await createBackup(note, '');
  } catch (e) {
    console.warn('[Store] 本地备份失败:', e);
  }
}

// 侧边栏状态保存 debounce
let _sidebarStateTimer: NodeJS.Timeout | null = null;
function debouncedSaveSidebarState(expandedNodes: string[], selectedNoteId: string | null) {
  if (_sidebarStateTimer) clearTimeout(_sidebarStateTimer);
  _sidebarStateTimer = setTimeout(() => {
    _sidebarStateTimer = null;
    saveSidebarState(expandedNodes, selectedNoteId).catch(e => {
      console.warn('[Store] 侧边栏状态保存失败:', e);
    });
  }, 1000);
}

async function flushSidebarState(expandedNodes: string[], selectedNoteId: string | null) {
  if (_sidebarStateTimer) {
    clearTimeout(_sidebarStateTimer);
    _sidebarStateTimer = null;
  }
  await saveSidebarState(expandedNodes, selectedNoteId).catch((e) => {
    console.warn('[Store] 侧边栏状态保存失败:', e);
  });
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  isLoading: false,
  isSyncing: false,
  lastSyncedAt: null,
  syncError: null,
  expandedNodes: [],
  sidebarCollapsed: false,
  activeTab: 'notes',
  searchQuery: '',
  loadingStatus: '就绪',
  loadingProgress: 0,
  dbReady: true,
  dbError: null,
  sseNotifications: [] as SSENotification[],
  folderRefreshTrigger: 0,

  loadFromCloud: async () => {
    set({ isLoading: true, syncError: null, loadingStatus: '正在加载...', loadingProgress: 0 });
    try {
      const res = await loadFullTree();
      if (res.success && Array.isArray(res.data)) {
        set({ notes: res.data.map(sanitizeNote), isLoading: false, loadingStatus: '就绪', loadingProgress: 100, dbReady: true });
      } else {
        set({ isLoading: false, syncError: res.error, loadingStatus: '加载失败' });
      }
      try {
        const sb = await loadSidebarState();
        if (sb.success && sb.data) {
          set({ expandedNodes: sb.data.expandedNodes || [], selectedNoteId: sb.data.selectedNoteId || null });
        }
      } catch (e) {
        console.warn('[Store] 侧边栏状态加载失败:', e);
      }
    } catch (e: any) { set({ isLoading: false, syncError: e.message, dbError: e.message }); }
  },

  syncToCloud: async () => {
    set({ isSyncing: true, loadingStatus: '保存中...' });
    try {
      const state = get();
      const selectedId = state.selectedNoteId;

      if (selectedId) {
        const note = state.notes.find((n) => n.id === selectedId);
        if (note) {
          await flushCloudSaves(note);
          await tryCreateBackup(note);
          _editCounters.delete(selectedId);
        }
      } else {
        await flushCloudSaves();
      }

      await flushSidebarState(state.expandedNodes, state.selectedNoteId);
      set({ isSyncing: false, lastSyncedAt: new Date(), loadingStatus: '就绪', syncError: null });
      return { success: true };
    } catch (e: any) {
      const message = e?.message || '保存失败';
      set({ isSyncing: false, syncError: message, loadingStatus: '保存失败' });
      return { success: false, error: message };
    }
  },

  hasPendingSaves: () => {
    return _pendingSaves.size > 0 || _activeSavePromises.size > 0 || _saveTimers.size > 0 || !!_sidebarStateTimer;
  },

  selectNote: (id: string | null) => {
    set({ selectedNoteId: id });
    debouncedSaveSidebarState(get().expandedNodes, id);
  },

  updateNote: (id: string, updates: Partial<Note>, opts?: { silent?: boolean; save?: boolean }) => {
    set((state) => {
      const now = new Date().toISOString();
      const newNotes = state.notes.map((n) => n.id === id ? { ...n, ...updates, updatedAt: now, updated_at: now } : n);
      return { notes: newNotes };
    });

    if (opts?.save !== false) {
      const note = get().notes.find((n) => n.id === id);
      if (note) {
        queueCloudSave(note).catch(() => {});
        if (updates.content !== undefined) {
          tryCreateBackup(note);
          _editCounters.delete(id);
        }
      }
    }
  },

  setSyncError: (err: string | null) => set({ syncError: err }),

  saveNoteById: async (id: string) => {
    const note = get().notes.find((n) => n.id === id);
    if (note) {
      await flushCloudSaves(note);
      tryCreateBackup(note);
      _editCounters.delete(id);
    }
  },

  addNote: (parentId: string | null, type: string = 'page', title: string = '新笔记', opts: { skipSelect?: boolean } = {}) => {
    const newNote = sanitizeNote({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title, type, parent_id: parentId,
      order_index: 0,
    });
    set((state) => ({ notes: [...state.notes, newNote] }));
    if (!opts.skipSelect) {
      set({ selectedNoteId: newNote.id });
      debouncedSaveSidebarState(get().expandedNodes, newNote.id);
    }
    queueCloudSave(newNote).catch(() => {
      set((state) => ({ notes: state.notes.filter((n) => n.id !== newNote.id) }));
      console.error('[Store] 新建笔记保存失败，已回滚:', newNote.id);
    });
    return newNote.id;
  },

  deleteNote: async (id: string) => {
    const deletedNotes = get().notes.filter((n) => n.id === id || n.parentId === id);
    // 清除被删笔记及其子笔记的保存队列，防止未完成的保存请求将它们复活
    for (const n of deletedNotes) {
      _editCounters.delete(n.id);
      _pendingSaves.delete(n.id);
      _activeSavePromises.delete(n.id);
      _debouncedSaveNotes.delete(n.id);
      if (_saveTimers.has(n.id)) {
        clearTimeout(_saveTimers.get(n.id)!);
        _saveTimers.delete(n.id);
      }
    }
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id && n.parentId !== id)
    }));
    const res = await deleteNoteFromCloud(id);
    if (res && !res.success) {
      set((state) => ({ notes: [...state.notes, ...deletedNotes] }));
      console.error('[Store] 删除笔记失败，已恢复:', res.error);
      return res;
    }
    return res;
  },

  toggleExpanded: (id: string) => {
    set((state) => {
      const nodes = state.expandedNodes;
      const newExpanded = nodes.includes(id) ? nodes.filter((x) => x !== id) : [...nodes, id];
      debouncedSaveSidebarState(newExpanded, state.selectedNoteId);
      return { expandedNodes: newExpanded };
    });
  },

  reorderPages: (parentId: string, newOrderIds: string[]) => {
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.parentId === parentId) {
          const idx = newOrderIds.indexOf(n.id);
          return idx >= 0 ? { ...n, order: idx } : n;
        }
        return n;
      })
    }));
    const notes = get().notes;
    const changed = notes.filter((n) =>
      n.parentId === parentId && newOrderIds.includes(n.id)
    );
    changed.forEach(n => queueCloudSave(n));
  },

  reorderSections: (parentId: string, newOrderIds: string[]) => {
    get().reorderPages(parentId, newOrderIds);
  },

  lockNote: async (noteId: string, userId: string, userName: string) => {
    const res = await apiLockNote(noteId, userName);
    if (res.success) {
      set((state) => ({
        notes: state.notes.map((n) => n.id === noteId ? { ...n, isLocked: true, lockedBy: userId, lockedByName: userName } : n)
      }));
    }
    return res;
  },

  unlockNote: async (noteId: string) => {
    const res = await apiUnlockNote(noteId);
    if (res.success) {
      set((state) => ({
        notes: state.notes.map((n) => n.id === noteId ? { ...n, isLocked: false, lockedBy: null, lockedByName: null } : n)
      }));
    }
    return res;
  },

  isNoteLockedByOther: (noteId: string, userId: string) => {
    const note = get().notes.find((n) => n.id === noteId);
    if (!note) return false;
    return !!(note.isLocked && note.lockedBy && note.lockedBy !== userId);
  },

  clearLocalCache: () => set({ notes: [], selectedNoteId: null, expandedNodes: [], loadingStatus: '已清除缓存' }),
  getNoteById: (id: string) => get().notes.find((n) => n.id === id),
  setSidebarCollapsed: (v: boolean) => set({ sidebarCollapsed: v }),
  setActiveTab: (v: string) => set({ activeTab: v }),
  setSearchQuery: (v: string) => set({ searchQuery: v }),

  isNoteEditing: (noteId: string) => {
    return _editingNotes.has(noteId);
  },

  upsertNote: (note: Record<string, unknown>) => {
    const sanitized = sanitizeNote(note);
    set((state) => {
      const exists = state.notes.some((n) => n.id === sanitized.id);
      if (exists) {
        return {
          notes: state.notes.map((n) => n.id === sanitized.id ? { ...n, ...sanitized } : n)
        };
      }
      return { notes: [...state.notes, sanitized] };
    });
  },

  fetchAndUpsertNote: async (noteId: string) => {
    try {
      const res = await apiGetNotebookInfo(noteId);
      if (res.success && res.data) {
        get().upsertNote(res.data);
      }
    } catch (e) {
      console.error('[Store] fetchAndUpsertNote 失败:', e);
    }
  },

  removeNoteFromStore: (noteId: string) => {
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== noteId),
      selectedNoteId: state.selectedNoteId === noteId ? null : state.selectedNoteId
    }));
  },

  updateNoteLock: (noteId: string, isLocked: boolean, lockedBy: string | null, lockedByName: string | null) => {
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === noteId
          ? { ...n, isLocked, lockedBy, lockedByName }
          : n
      )
    }));
  },

  addSSENotification: (notification: SSENotification) => {
    set((state) => ({
      sseNotifications: [...state.sseNotifications, notification]
    }));
  },

  clearSSENotifications: (noteId?: string) => {
    if (noteId) {
      set((state) => ({
        sseNotifications: state.sseNotifications.filter((n) => n.noteId !== noteId)
      }));
    } else {
      set({ sseNotifications: [] });
    }
  },

  triggerFolderRefresh: () => {
    set((state) => ({ folderRefreshTrigger: state.folderRefreshTrigger + 1 }));
  },
}));

// 导出缓存和编辑标记
export const getUpdateLogsCache = () => _updateLogsCache;
export const setUpdateLogsCache = (logs: any[]) => { _updateLogsCache = logs; };
export const markNoteAsEditing = (id: string) => { _editingNotes.add(id); };
export const markNoteAsEditingEnd = (id: string) => { _editingNotes.delete(id); };
