/**
 * 笔记状态管理 (v5 - 精简保存版)
 * 核心改动：
 * - updateNote 只更新 store，不自动保存
 * - 累计编辑量达到阈值后自动保存当前页面
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

// === 全局缓存 ===
let _updateLogsCache: any[] = [];
let _editingNotes = new Set<string>();

// 编辑量追踪：记录每个笔记未保存的编辑次数
const _editCounters = new Map<string, number>();
// 编辑量阈值：累积 2 次编辑自动保存（静默，不弹提示）
const AUTO_SAVE_THRESHOLD = 2;

// 云端保存 debounce：避免短时间大量请求
const _saveTimers = new Map<string, NodeJS.Timeout>();

function sanitizeNote(n: any): any {
  if (!n) return {};
  return {
    ...n,
    id: n.id || `gen-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    title: n.title || '无标题',
    content: n.content || '',
    type: n.type || 'page',
    parent_id: n.parent_id || n.parentId || null,
    parentId: n.parentId || n.parent_id || null,
    owner_id: n.owner_id || '',
    owner_email: n.owner_email || '',
    order_index: n.order_index ?? n.order ?? 0,
    order: n.order ?? n.order_index ?? 0,
    icon: n.icon || '',
    created_at: n.created_at || new Date().toISOString(),
    updated_at: n.updated_at || n.updatedAt || new Date().toISOString(),
    updatedAt: n.updatedAt || n.updated_at || new Date().toISOString(),
    tags: Array.isArray(n.tags) ? n.tags : [],
    path: n.path || '',
    shared_with: n.shared_with || n.shared_users || [],
    is_locked: n.is_locked || false,
    locked_by: n.locked_by || n.lockedBy || null,
    lockedBy: n.lockedBy || n.locked_by || null,
    locked_by_name: n.locked_by_name || n.lockedByName || null,
    lockedByName: n.lockedByName || n.locked_by_name || null,
    version: n.version || 1,
    rootNotebookId: n.rootNotebookId || n.root_notebook_id || '',
    root_notebook_id: n.root_notebook_id || n.rootNotebookId || ''
  };
}

/**
 * 立即保存单个笔记到云端
 */
async function saveSingleNote(note: any) {
  try {
    await saveNoteToCloud(note);
    console.log(`[Store] 云端保存成功: ${note.id.substring(0, 12)}...`);
  } catch (e) {
    console.error(`[Store] 云端保存失败: ${note.id}`, e);
  }
}

/**
 * debounce 保存单个笔记（2秒内同一笔记只保存一次）
 * 用于 reorderPages 等批量操作场景
 */
function debouncedCloudSave(note: any) {
  const id = note.id;
  if (_saveTimers.has(id)) {
    clearTimeout(_saveTimers.get(id)!);
  }
  _saveTimers.set(id, setTimeout(async () => {
    _saveTimers.delete(id);
    await saveSingleNote(note);
  }, 2000));
}

/**
 * 创建本地备份（如果已开启）
 */
async function tryCreateBackup(note: any) {
  try {
    const config = getBackupConfig();
    if (!config.enabled) return;
    if (note.type !== 'page') return;
    const content = note.content || '';
    if (typeof content !== 'string' || content.length < 50) return;
    await createBackup(note as Note, '');
  } catch (e) {
    console.warn('[Store] 本地备份失败:', e);
  }
}

// 侧边栏状态保存 debounce
let _sidebarStateTimer: NodeJS.Timeout | null = null;
function debouncedSaveSidebarState(expandedNodes: string[], selectedNoteId: string | null) {
  if (_sidebarStateTimer) clearTimeout(_sidebarStateTimer);
  _sidebarStateTimer = setTimeout(() => {
    saveSidebarState(expandedNodes, selectedNoteId).catch(e => {
      console.warn('[Store] 侧边栏状态保存失败:', e);
    });
  }, 1000);
}

export const useNoteStore = create<any>((set, get) => ({
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
      } catch(e) {}
    } catch (e: any) { set({ isLoading: false, syncError: e.message, dbError: e.message }); }
  },

  /**
   * 保存当前选中页面到云端（Ctrl+S 使用）
   * 只保存当前正在编辑的那一个页面
   */
  syncToCloud: async () => {
    set({ isSyncing: true, loadingStatus: '保存中...' });
    const state = get();
    const selectedId = state.selectedNoteId;
    
    if (selectedId) {
      const note = state.notes.find((n: Note) => n.id === selectedId);
      if (note) {
        await saveSingleNote(note);
        // 同步保存本地备份
        await tryCreateBackup(note);
        // 重置编辑计数器
        _editCounters.delete(selectedId);
      }
    }
    
    // 同时保存侧边栏状态
    await saveSidebarState(state.expandedNodes, state.selectedNoteId).catch(() => {});
    set({ isSyncing: false, lastSyncedAt: new Date(), loadingStatus: '就绪' });
    return { success: true };
  },

  selectNote: (id: string | null) => {
    set({ selectedNoteId: id });
    // 持久化选中状态
    debouncedSaveSidebarState(get().expandedNodes, id);
  },

  /**
   * 统一更新入口：更新 store
   * 编辑量累计达到阈值后自动保存 + 本地备份
   */
  updateNote: (id: string, updates: any) => {
    set((state: any) => {
      const now = new Date().toISOString();
      const newNotes = state.notes.map((n: Note) => n.id === id ? { ...n, ...updates, updatedAt: now, updated_at: now } : n);
      return { notes: newNotes };
    });
    
    if (updates.content !== undefined) {
      const count = (_editCounters.get(id) || 0) + 1;
      _editCounters.set(id, count);
      
      if (count >= AUTO_SAVE_THRESHOLD) {
        _editCounters.set(id, 0);
        const note = get().notes.find((n: Note) => n.id === id);
        if (note) {
          saveSingleNote(note);
          tryCreateBackup(note);
          console.log(`[Store] 编辑量达阈值(${AUTO_SAVE_THRESHOLD})，自动保存: ${id.substring(0, 12)}...`);
        }
      }
    }
  },

  setSyncError: (err: string | null) => set({ syncError: err }),

  saveNoteById: async (id: string) => {
    const note = get().notes.find((n: Note) => n.id === id);
    if (note) {
      await saveSingleNote(note);
      tryCreateBackup(note);
      _editCounters.delete(id);
      console.log(`[Store] 切换页面自动保存: ${id.substring(0, 12)}...`);
    }
  },

  addNote: (parentId: string | null, type: string = 'page', title: string = '新笔记', opts: any = {}) => {
    const newNote = sanitizeNote({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title, type, parent_id: parentId, parentId,
      order_index: 0, order: 0
    });
    set((state: any) => ({ notes: [...state.notes, newNote] }));
    if (!opts.skipSelect) {
      set({ selectedNoteId: newNote.id });
      debouncedSaveSidebarState(get().expandedNodes, newNote.id);
    }
    saveSingleNote(newNote).catch(() => {
      set((state: any) => ({ notes: state.notes.filter((n: Note) => n.id !== newNote.id) }));
      console.error('[Store] 新建笔记保存失败，已回滚:', newNote.id);
    });
    return newNote.id;
  },

  deleteNote: async (id: string) => {
    const deletedNotes = get().notes.filter((n: Note) => n.id === id || n.parent_id === id || n.parentId === id);
    _editCounters.delete(id);
    set((state: any) => ({
      notes: state.notes.filter((n: Note) => n.id !== id && n.parent_id !== id && n.parentId !== id)
    }));
    const res = await deleteNoteFromCloud(id);
    if (res && !res.success) {
      set((state: any) => ({ notes: [...state.notes, ...deletedNotes] }));
      console.error('[Store] 删除笔记失败，已恢复:', res.error);
      return res;
    }
    return res;
  },

  toggleExpanded: (id: string) => {
    set((state: any) => {
      const nodes = state.expandedNodes;
      const newExpanded = nodes.includes(id) ? nodes.filter((x: string) => x !== id) : [...nodes, id];
      debouncedSaveSidebarState(newExpanded, state.selectedNoteId);
      return { expandedNodes: newExpanded };
    });
  },

  reorderPages: (parentId: string, newOrderIds: string[]) => {
    set((state: any) => ({
      notes: state.notes.map((n: Note) => {
        if (n.parent_id === parentId || n.parentId === parentId) {
          const idx = newOrderIds.indexOf(n.id);
          return idx >= 0 ? { ...n, order_index: idx, order: idx } : n;
        }
        return n;
      })
    }));
    const notes = get().notes;
    const changed = notes.filter((n: Note) =>
      (n.parent_id === parentId || n.parentId === parentId) &&
      newOrderIds.includes(n.id)
    );
    changed.forEach(n => debouncedCloudSave(n));
  },

  reorderSections: (parentId: string, newOrderIds: string[]) => {
    get().reorderPages(parentId, newOrderIds);
  },

  // 锁管理
  lockNote: async (noteId: string, userId: string, userName: string) => {
    const res = await apiLockNote(noteId, userName);
    if (res.success) {
      set((state: any) => ({
        notes: state.notes.map((n: Note) => n.id === noteId ? { ...n, is_locked: true, locked_by: userId, lockedBy: userId, locked_by_name: userName, lockedByName: userName } : n)
      }));
    }
    return res;
  },

  unlockNote: async (noteId: string) => {
    const res = await apiUnlockNote(noteId);
    if (res.success) {
      set((state: any) => ({
        notes: state.notes.map((n: Note) => n.id === noteId ? { ...n, is_locked: false, locked_by: null, lockedBy: null, locked_by_name: null, lockedByName: null } : n)
      }));
    }
    return res;
  },

  isNoteLockedByOther: (noteId: string, userId: string) => {
    const note = get().notes.find((n: Note) => n.id === noteId);
    if (!note) return false;
    return note.is_locked && note.locked_by && note.locked_by !== userId;
  },

  clearLocalCache: () => set({ notes: [], selectedNoteId: null, expandedNodes: [], loadingStatus: '已清除缓存' }),
  getNoteById: (id: string) => get().notes.find((n: Note) => n.id === id),
  setSidebarCollapsed: (v: boolean) => set({ sidebarCollapsed: v }),
  setActiveTab: (v: string) => set({ activeTab: v }),
  setSearchQuery: (v: string) => set({ searchQuery: v }),

  isNoteEditing: (noteId: string) => {
    return _editingNotes.has(noteId);
  },

  upsertNote: (note: any) => {
    const sanitized = sanitizeNote(note);
    set((state: any) => {
      const exists = state.notes.some((n: Note) => n.id === sanitized.id);
      if (exists) {
        return {
          notes: state.notes.map((n: Note) => n.id === sanitized.id ? { ...n, ...sanitized } : n)
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
    set((state: any) => ({
      notes: state.notes.filter((n: Note) => n.id !== noteId),
      selectedNoteId: state.selectedNoteId === noteId ? null : state.selectedNoteId
    }));
  },

  updateNoteLock: (noteId: string, isLocked: boolean, lockedBy: string | null, lockedByName: string | null) => {
    set((state: any) => ({
      notes: state.notes.map((n: Note) =>
        n.id === noteId
          ? { ...n, is_locked: isLocked, locked_by: lockedBy, lockedBy: lockedBy, locked_by_name: lockedByName, lockedByName: lockedByName }
          : n
      )
    }));
  },

  addSSENotification: (notification: SSENotification) => {
    set((state: any) => ({
      sseNotifications: [...state.sseNotifications, notification]
    }));
  },

  clearSSENotifications: (noteId?: string) => {
    if (noteId) {
      set((state: any) => ({
        sseNotifications: state.sseNotifications.filter((n: SSENotification) => n.noteId !== noteId)
      }));
    } else {
      set({ sseNotifications: [] });
    }
  },

  triggerFolderRefresh: () => {
    set((state: any) => ({ folderRefreshTrigger: state.folderRefreshTrigger + 1 }));
  },
}));

// 导出缓存和编辑标记
export const getUpdateLogsCache = () => _updateLogsCache;
export const setUpdateLogsCache = (logs: any[]) => { _updateLogsCache = logs; };
export const markNoteAsEditing = (id: string) => { _editingNotes.add(id); };
export const markNoteAsEditingEnd = (id: string) => { _editingNotes.delete(id); };
