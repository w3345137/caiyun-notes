/**
 * 笔记状态管理 (v4 - 统一保存版)
 * 核心改动：updateNote 自动触发云端保存 + 本地备份
 * 所有组件只需调 updateNote，保存逻辑由 store 统一处理
 */
import { create } from 'zustand';
import { Note } from '../types';
import {
  loadFullTree, saveNoteToCloud, deleteNoteFromCloud,
  apiLockNote, apiUnlockNote, apiGetPageLock,
  saveSidebarState, loadSidebarState,
} from '../lib/edgeApi';
import { createBackup, getBackupConfig } from '../lib/localBackup';

// === 全局缓存 ===
let _updateLogsCache: any[] = [];
let _editingNotes = new Set<string>();

// 云端保存 debounce：避免短时间大量请求
const _saveTimers = new Map<string, NodeJS.Timeout>();

function sanitizeNote(n: any): any {
  if (!n) return {};
  return {
    ...n,
    id: n.id || `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    version: n.version || 1,
    rootNotebookId: n.rootNotebookId || n.root_notebook_id || '',
    root_notebook_id: n.root_notebook_id || n.rootNotebookId || ''
  };
}

/**
 * 延迟保存到云端（debounce，2秒内同一笔记只保存一次）
 */
function debouncedCloudSave(note: any) {
  const id = note.id;
  if (_saveTimers.has(id)) {
    clearTimeout(_saveTimers.get(id)!);
  }
  _saveTimers.set(id, setTimeout(async () => {
    _saveTimers.delete(id);
    try {
      await saveNoteToCloud(note);
      console.log(`[Store] 云端保存成功: ${note.id.substring(0, 12)}...`);
    } catch (e) {
      console.error(`[Store] 云端保存失败: ${note.id}`, e);
    }
  }, 2000));
}

/**
 * 立即保存到云端（不 debounce，用于 Ctrl+S 等手动保存）
 */
async function immediateCloudSave(note: any) {
  // 清除可能存在的 debounce 定时器
  const id = note.id;
  if (_saveTimers.has(id)) {
    clearTimeout(_saveTimers.get(id)!);
    _saveTimers.delete(id);
  }
  try {
    await saveNoteToCloud(note);
  } catch (e) {
    console.error(`[Store] 立即保存失败: ${note.id}`, e);
  }
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
    // 备份失败不影响保存流程
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
   * 全量同步到云端（Ctrl+S 使用）
   * 立即保存所有笔记，不 debounce
   */
  syncToCloud: async () => {
    set({ isSyncing: true, loadingStatus: '同步中...' });
    const notes = get().notes;
    for (const n of notes) {
      if (n.content || n.title) {
        await immediateCloudSave(n);
      }
    }
    // 同时保存侧边栏状态
    const state = get();
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
   * 统一更新入口：更新 store + 自动云端保存 + 本地备份
   * content 变化时触发备份（debounce），其他字段变化直接保存
   */
  updateNote: (id: string, updates: any) => {
    set((state: any) => {
      const newNotes = state.notes.map((n: Note) => n.id === id ? { ...n, ...updates } : n);
      // 找到更新后的笔记
      const updatedNote = newNotes.find((n: Note) => n.id === id);
      if (updatedNote) {
        // 云端保存（debounce 2秒）
        debouncedCloudSave(updatedNote);
        // 内容变化时创建本地备份
        if (updates.content !== undefined) {
          tryCreateBackup(updatedNote);
        }
      }
      return { notes: newNotes };
    });
  },

  setSyncError: (err: string | null) => set({ syncError: err }),

  addNote: (parentId: string | null, type: string = 'page', title: string = '新笔记', opts: any = {}) => {
    const newNote = sanitizeNote({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title, type, parent_id: parentId, parentId,
      order_index: 0, order: 0
    });
    set((state: any) => ({ notes: [...state.notes, newNote] }));
    if (!opts.skipSelect) {
      set({ selectedNoteId: newNote.id });
      debouncedSaveSidebarState(get().expandedNodes, newNote.id);
    }
    // 新建笔记立即保存到云端（不 debounce）
    immediateCloudSave(newNote);
    return newNote.id;
  },

  deleteNote: async (id: string) => {
    await deleteNoteFromCloud(id);
    set((state: any) => ({
      notes: state.notes.filter((n: Note) => n.id !== id && n.parent_id !== id && n.parentId !== id)
    }));
  },

  toggleExpanded: (id: string) => {
    set((state: any) => {
      const nodes = state.expandedNodes;
      const newExpanded = nodes.includes(id) ? nodes.filter((x: string) => x !== id) : [...nodes, id];
      // 持久化侧边栏状态
      debouncedSaveSidebarState(newExpanded, state.selectedNoteId);
      return { expandedNodes: newExpanded };
    });
  },

  reorderPages: (notebookId: string, newOrderIds: string[]) => {
    set((state: any) => ({
      notes: state.notes.map((n: Note) => {
        if (n.parent_id === notebookId || n.parentId === notebookId) {
          const idx = newOrderIds.indexOf(n.id);
          return idx >= 0 ? { ...n, order_index: idx, order: idx } : n;
        }
        return n;
      })
    }));
    // 排序变化后保存
    const notes = get().notes;
    const changed = notes.filter((n: Note) =>
      (n.parent_id === notebookId || n.parentId === notebookId) &&
      newOrderIds.includes(n.id)
    );
    changed.forEach(n => debouncedCloudSave(n));
  },

  reorderSections: (notebookId: string, newOrderIds: string[]) => {
    set((state: any) => ({
      notes: state.notes.map((n: Note) => {
        if (n.parent_id === notebookId || n.parentId === notebookId) {
          const idx = newOrderIds.indexOf(n.id);
          return idx >= 0 ? { ...n, order_index: idx, order: idx } : n;
        }
        return n;
      })
    }));
    const notes = get().notes;
    const changed = notes.filter((n: Note) =>
      (n.parent_id === notebookId || n.parentId === notebookId) &&
      newOrderIds.includes(n.id)
    );
    changed.forEach(n => debouncedCloudSave(n));
  },

  // 锁管理
  lockNote: async (noteId: string, userId: string, userName: string) => {
    const res = await apiLockNote(noteId, userName);
    if (res.success) {
      set((state: any) => ({
        notes: state.notes.map((n: Note) => n.id === noteId ? { ...n, is_locked: true, locked_by: userId } : n)
      }));
    }
    return res;
  },

  unlockNote: async (noteId: string) => {
    const res = await apiUnlockNote(noteId);
    if (res.success) {
      set((state: any) => ({
        notes: state.notes.map((n: Note) => n.id === noteId ? { ...n, is_locked: false, locked_by: null } : n)
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
  setSearchQuery: (v: string) => set({ searchQuery: v })
}));

// 导出缓存和编辑标记
export const getUpdateLogsCache = () => _updateLogsCache;
export const setUpdateLogsCache = (logs: any[]) => { _updateLogsCache = logs; };
export const markNoteAsEditing = (id: string) => { _editingNotes.add(id); };
export const markNoteAsEditingEnd = (id: string) => { _editingNotes.delete(id); };
