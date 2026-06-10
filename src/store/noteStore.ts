/**
 * 笔记状态管理 (v5 - 精简保存版)
 * 核心改动：
 * - updateNote 更新 store 后立即排队保存
 * - 同一笔记的高频保存串行化，刷新前可等待队列刷完
 * - syncToCloud 作为内部 flush 兜底，只处理当前选中页面的待同步队列
 * - 去掉定时保存和全量同步
 */
import { create } from 'zustand';
import { Note } from '../types';
import {
  loadFullTree, saveNoteToCloud, deleteNoteFromCloud,
  apiLockNote, apiUnlockNote, apiGetPageLock,
  saveSidebarState, loadSidebarState, apiGetNotebookInfo,
} from '../lib/edgeApi';
import { getCurrentUserId } from '../lib/auth';
import { createBackup, getBackupConfig } from '../lib/localBackup';
import { resolveSidebarStateForNotes } from '../lib/sidebarStateResolver';
import {
  clearAllNoteDrafts,
  deleteNoteDraft,
  flushNoteDrafts,
  hasPendingDraftSaves,
  mergeNotesWithLocalDrafts,
  saveNoteDraft,
} from '../lib/localDraft';

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
  folderRefreshNoteId: string | null;

  // Actions
  loadFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<{ success: boolean; error?: string }>;
  hasPendingSaves: () => boolean;
  selectNote: (id: string | null) => void;
  updateNote: (id: string, updates: Partial<Note>, opts?: { silent?: boolean; save?: boolean }) => void;
  touchNoteUpdatedAt: (id: string, updatedAt?: string) => void;
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
  triggerFolderRefresh: (noteId?: string | null) => void;
}

// === 全局缓存 ===
let _updateLogsCache: any[] = [];
const _editingNotes = new Set<string>();

// 编辑量追踪：记录每个笔记未保存的编辑次数
const _editCounters = new Map<string, number>();

// 云端保存 debounce：输入时先写本地草稿，再把云端保存合并为短批次
const CLOUD_SAVE_DEBOUNCE_MS = 1000;
const BACKUP_SAVE_DEBOUNCE_MS = 30000;
const _saveTimers = new Map<string, NodeJS.Timeout>();
const _debouncedSaveNotes = new Map<string, Note>();
const _pendingSaves = new Map<string, Note>();
const _activeSavePromises = new Map<string, Promise<void>>();
const _backupTimers = new Map<string, NodeJS.Timeout>();
const _pendingBackupNotes = new Map<string, Note>();
const NOTES_TREE_SNAPSHOT_KEY = 'caiyun_notes_tree_snapshot_v1';
const NOTES_TREE_SNAPSHOT_MAX_CHARS = 4_500_000;
let _noteLocalRevision = 0;
let _selectionRevision = 0;
let _expandedRevision = 0;
const _noteLocalChangeRevisions = new Map<string, number>();
const _noteLocalDeleteRevisions = new Map<string, number>();

type NotesTreeSnapshot = {
  userId: string;
  notes: Note[];
  selectedNoteId: string | null;
  expandedNodes: string[];
  savedAt: string;
};

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

function isBrowserStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function createNotesTreeSnapshot(notes: Note[], selectedNoteId: string | null, expandedNodes: string[]): NotesTreeSnapshot | null {
  const userId = getCurrentUserId();
  if (!userId) return null;

  const base: NotesTreeSnapshot = {
    userId,
    notes,
    selectedNoteId,
    expandedNodes,
    savedAt: new Date().toISOString(),
  };

  const fullJson = JSON.stringify(base);
  if (fullJson.length <= NOTES_TREE_SNAPSHOT_MAX_CHARS) return base;

  const slimNotes = notes.map((note) => (
    note.id === selectedNoteId
      ? note
      : { ...note, content: '' }
  ));
  const slim: NotesTreeSnapshot = { ...base, notes: slimNotes };
  const slimJson = JSON.stringify(slim);
  return slimJson.length <= NOTES_TREE_SNAPSHOT_MAX_CHARS ? slim : null;
}

function persistNotesTreeSnapshot(notes: Note[], selectedNoteId: string | null, expandedNodes: string[]) {
  if (!isBrowserStorageAvailable()) return;
  try {
    const snapshot = createNotesTreeSnapshot(notes, selectedNoteId, expandedNodes);
    if (!snapshot) {
      localStorage.removeItem(NOTES_TREE_SNAPSHOT_KEY);
      return;
    }
    localStorage.setItem(NOTES_TREE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn('[Store] 本地笔记树快照保存失败:', e);
  }
}

function loadNotesTreeSnapshot(): Pick<NotesTreeSnapshot, 'notes' | 'selectedNoteId' | 'expandedNodes'> | null {
  if (!isBrowserStorageAvailable()) return null;
  try {
    const raw = localStorage.getItem(NOTES_TREE_SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as NotesTreeSnapshot;
    const currentUserId = getCurrentUserId();
    if (!currentUserId || snapshot.userId !== currentUserId) return null;
    if (!Array.isArray(snapshot.notes)) return null;
    return {
      notes: snapshot.notes.map(sanitizeNote),
      selectedNoteId: snapshot.selectedNoteId || null,
      expandedNodes: Array.isArray(snapshot.expandedNodes) ? snapshot.expandedNodes : [],
    };
  } catch (e) {
    console.warn('[Store] 本地笔记树快照读取失败:', e);
    localStorage.removeItem(NOTES_TREE_SNAPSHOT_KEY);
    return null;
  }
}

const initialNotesTreeSnapshot = loadNotesTreeSnapshot();

function isLockedByOtherForCurrentUser(note?: Note | null): boolean {
  if (!note?.isLocked || !note.lockedBy) return false;
  const currentUserId = getCurrentUserId();
  return !!currentUserId && note.lockedBy !== currentUserId;
}

function discardQueuedCloudWork(noteId: string) {
  _pendingSaves.delete(noteId);
  _debouncedSaveNotes.delete(noteId);

  const saveTimer = _saveTimers.get(noteId);
  if (saveTimer) {
    clearTimeout(saveTimer);
    _saveTimers.delete(noteId);
  }
}

function hasQueuedCloudWork(noteId: string): boolean {
  return _pendingSaves.has(noteId)
    || _debouncedSaveNotes.has(noteId)
    || _saveTimers.has(noteId)
    || _activeSavePromises.has(noteId);
}

function markNoteChangedLocally(noteId: string) {
  _noteLocalRevision += 1;
  _noteLocalChangeRevisions.set(noteId, _noteLocalRevision);
  _noteLocalDeleteRevisions.delete(noteId);
}

function markNoteDeletedLocally(noteId: string) {
  _noteLocalRevision += 1;
  _noteLocalDeleteRevisions.set(noteId, _noteLocalRevision);
  _noteLocalChangeRevisions.delete(noteId);
}

function mergeNotesWithConcurrentLocalChanges(cloudNotes: Note[], currentNotes: Note[], loadRevision: number): Note[] {
  const currentById = new Map(currentNotes.map((note) => [note.id, note]));
  const cloudIds = new Set<string>();
  const merged: Note[] = [];

  for (const cloudNote of cloudNotes) {
    cloudIds.add(cloudNote.id);
    const deleteRevision = _noteLocalDeleteRevisions.get(cloudNote.id) || 0;
    if (deleteRevision > loadRevision) continue;

    const changeRevision = _noteLocalChangeRevisions.get(cloudNote.id) || 0;
    const currentNote = currentById.get(cloudNote.id);
    if (!currentNote || changeRevision <= loadRevision) {
      merged.push(cloudNote);
      continue;
    }

    const cloudRecord = cloudNote as Note & Record<string, unknown>;
    merged.push(sanitizeNote({
      ...cloudNote,
      ...currentNote,
      ownerId: cloudNote.ownerId,
      owner_id: cloudRecord.owner_id,
      rootNotebookId: cloudNote.rootNotebookId,
      root_notebook_id: cloudRecord.root_notebook_id,
      isLocked: cloudNote.isLocked,
      is_locked: cloudRecord.is_locked,
      lockedBy: cloudNote.lockedBy,
      locked_by: cloudRecord.locked_by,
      lockedByName: cloudNote.lockedByName,
      locked_by_name: cloudRecord.locked_by_name,
      lockedAt: cloudNote.lockedAt,
      locked_at: cloudRecord.locked_at,
      version: cloudNote.version,
    }));
  }

  for (const currentNote of currentNotes) {
    const changeRevision = _noteLocalChangeRevisions.get(currentNote.id) || 0;
    if (!cloudIds.has(currentNote.id) && changeRevision > loadRevision) {
      merged.push(currentNote);
    }
  }

  return merged;
}

/**
 * 立即保存单个笔记到云端
 */
async function saveSingleNote(note: Note) {
  try {
    const result = await saveNoteToCloud(note);
    if (result && !result.success) {
      if (result.error === 'PAGE_LOCKED_BY_OTHER') {
        console.warn(`[Store] 跳过被其他用户锁定页面的普通保存: ${note.id}`);
        return result;
      }
      throw new Error(result.error || '自动同步失败');
    }
    return result;
  } catch (e) {
    console.error(`[Store] 云端同步失败: ${note.id}`, e);
    throw e;
  }
}

async function queueCloudSave(note: Note) {
  if (isLockedByOtherForCurrentUser(note)) {
    discardQueuedCloudWork(note.id);
    return;
  }

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
    if (isLockedByOtherForCurrentUser(note)) {
      discardQueuedCloudWork(note.id);
      return;
    }
    if (hasQueuedCloudWork(note.id)) {
      _pendingSaves.set(note.id, note);
    }
  }

  for (const [id, timer] of _saveTimers) {
    clearTimeout(timer);
    _saveTimers.delete(id);
    const delayedNote = _debouncedSaveNotes.get(id);
    _debouncedSaveNotes.delete(id);
    if (delayedNote && !isLockedByOtherForCurrentUser(delayedNote)) {
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
 * debounce 保存单个笔记（高频输入合并成短批次）
 */
function debouncedCloudSave(note: Note, delay = CLOUD_SAVE_DEBOUNCE_MS) {
  if (isLockedByOtherForCurrentUser(note)) {
    discardQueuedCloudWork(note.id);
    return;
  }

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
  }, delay));
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

function scheduleBackup(note: Note) {
  if (note.type !== 'page') return;

  const id = note.id;
  if (_backupTimers.has(id)) {
    clearTimeout(_backupTimers.get(id)!);
  }

  _pendingBackupNotes.set(id, note);
  _backupTimers.set(id, setTimeout(async () => {
    _backupTimers.delete(id);
    const latest = _pendingBackupNotes.get(id) || note;
    _pendingBackupNotes.delete(id);
    await tryCreateBackup(latest);
  }, BACKUP_SAVE_DEBOUNCE_MS));
}

async function flushBackups(note?: Note) {
  if (note?.type === 'page') {
    _pendingBackupNotes.set(note.id, note);
  }

  const ids = note
    ? [note.id]
    : Array.from(new Set([..._pendingBackupNotes.keys(), ..._backupTimers.keys()]));

  const tasks: Promise<void>[] = [];
  for (const id of ids) {
    const timer = _backupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      _backupTimers.delete(id);
    }

    const latest = _pendingBackupNotes.get(id);
    _pendingBackupNotes.delete(id);
    if (latest) {
      tasks.push(tryCreateBackup(latest));
    }
  }

  await Promise.all(tasks);
}

function clearQueuedSavesForNote(noteId: string) {
  _editCounters.delete(noteId);
  _pendingSaves.delete(noteId);
  _activeSavePromises.delete(noteId);
  _debouncedSaveNotes.delete(noteId);
  _pendingBackupNotes.delete(noteId);

  if (_saveTimers.has(noteId)) {
    clearTimeout(_saveTimers.get(noteId)!);
    _saveTimers.delete(noteId);
  }

  if (_backupTimers.has(noteId)) {
    clearTimeout(_backupTimers.get(noteId)!);
    _backupTimers.delete(noteId);
  }
}

function collectNoteAndDescendants(notes: Note[], rootId: string): Note[] {
  const childrenByParent = new Map<string, Note[]>();
  for (const note of notes) {
    if (!note.parentId) continue;
    const children = childrenByParent.get(note.parentId) || [];
    children.push(note);
    childrenByParent.set(note.parentId, children);
  }

  const collected: Note[] = [];
  const stack = notes.filter((note) => note.id === rootId);
  while (stack.length > 0) {
    const current = stack.pop()!;
    collected.push(current);
    stack.push(...(childrenByParent.get(current.id) || []));
  }

  return collected;
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
  notes: initialNotesTreeSnapshot?.notes || [],
  selectedNoteId: initialNotesTreeSnapshot?.selectedNoteId || null,
  isLoading: false,
  isSyncing: false,
  lastSyncedAt: null,
  syncError: null,
  expandedNodes: initialNotesTreeSnapshot?.expandedNodes || [],
  sidebarCollapsed: false,
  activeTab: 'notes',
  searchQuery: '',
  loadingStatus: '就绪',
  loadingProgress: 0,
  dbReady: true,
  dbError: null,
  sseNotifications: [] as SSENotification[],
  folderRefreshTrigger: 0,
  folderRefreshNoteId: null,

  loadFromCloud: async () => {
    const loadNoteRevision = _noteLocalRevision;
    const loadSelectionRevision = _selectionRevision;
    const loadExpandedRevision = _expandedRevision;
    const previousNotes = get().notes;
    set({ isLoading: true, syncError: null, loadingStatus: '正在加载...', loadingProgress: 0 });
    try {
      const res = await loadFullTree();
      let loadedNotes: Note[] | null = null;
      if (res.success && Array.isArray(res.data)) {
        const cloudNotes = res.data.map(sanitizeNote);
        const { notes, restoredNoteIds } = await mergeNotesWithLocalDrafts(cloudNotes);
        const notesWithLocalChanges = mergeNotesWithConcurrentLocalChanges(notes, get().notes, loadNoteRevision);
        const stateBeforeSet = get();
        const resolvedSidebarState = resolveSidebarStateForNotes(notesWithLocalChanges, previousNotes, {
          selectedNoteId: stateBeforeSet.selectedNoteId,
          expandedNodes: stateBeforeSet.expandedNodes,
        });
        const loadPatch: Partial<NoteStore> = {
          notes: notesWithLocalChanges,
          isLoading: false,
          loadingStatus: '就绪',
          loadingProgress: 100,
          dbReady: true,
        };
        if (_selectionRevision === loadSelectionRevision) {
          loadPatch.selectedNoteId = resolvedSidebarState.selectedNoteId;
        }
        if (_expandedRevision === loadExpandedRevision) {
          loadPatch.expandedNodes = resolvedSidebarState.expandedNodes;
        }
        loadedNotes = notesWithLocalChanges;
        set(loadPatch);

        if (restoredNoteIds.length > 0) {
          console.warn('[Store] 已从本地草稿恢复未同步内容:', restoredNoteIds);
          for (const noteId of restoredNoteIds) {
            const restored = notesWithLocalChanges.find((n) => n.id === noteId);
            if (restored) {
              debouncedCloudSave(restored, 250);
            }
          }
        }
      } else {
        set({ isLoading: false, syncError: res.error, loadingStatus: '加载失败' });
      }
      try {
        const sb = await loadSidebarState();
        if (sb.success && sb.data) {
          const state = get();
          const currentSelectedExists = !!(
            state.selectedNoteId &&
            state.notes.some((note) => note.id === state.selectedNoteId)
          );
          const resolvedCloudSidebarState = resolveSidebarStateForNotes(state.notes, previousNotes, {
            selectedNoteId: sb.data.selectedNoteId || null,
            expandedNodes: sb.data.expandedNodes || [],
          });
          const sidebarPatch: Partial<NoteStore> = {};

          if (_expandedRevision === loadExpandedRevision && state.expandedNodes.length === 0) {
            sidebarPatch.expandedNodes = resolvedCloudSidebarState.expandedNodes;
          }

          if (_selectionRevision === loadSelectionRevision && !currentSelectedExists) {
            sidebarPatch.selectedNoteId = resolvedCloudSidebarState.selectedNoteId;
          }

          if (Object.keys(sidebarPatch).length > 0) {
            set(sidebarPatch);
          }
        }
      } catch (e) {
        console.warn('[Store] 侧边栏状态加载失败:', e);
      }
      if (loadedNotes) {
        const state = get();
        persistNotesTreeSnapshot(state.notes, state.selectedNoteId, state.expandedNodes);
      }
    } catch (e: any) { set({ isLoading: false, syncError: e.message, dbError: e.message }); }
  },

  syncToCloud: async () => {
    set({ isSyncing: true, loadingStatus: '同步中...' });
    try {
      const state = get();
      const selectedId = state.selectedNoteId;

      if (selectedId) {
        const note = state.notes.find((n) => n.id === selectedId);
        if (note) {
          await flushNoteDrafts(selectedId);
          if (isLockedByOtherForCurrentUser(note)) {
            discardQueuedCloudWork(selectedId);
          } else {
            await flushCloudSaves(note);
            await flushBackups(note);
          }
          _editCounters.delete(selectedId);
        }
      } else {
        await flushNoteDrafts();
        await flushCloudSaves();
        await flushBackups();
      }

      await flushSidebarState(state.expandedNodes, state.selectedNoteId);
      set({ isSyncing: false, lastSyncedAt: new Date(), loadingStatus: '就绪', syncError: null });
      return { success: true };
    } catch (e: any) {
      const message = e?.message || '自动同步失败';
      set({ isSyncing: false, syncError: message, loadingStatus: '同步失败' });
      return { success: false, error: message };
    }
  },

  hasPendingSaves: () => {
    return hasPendingDraftSaves() || _pendingSaves.size > 0 || _activeSavePromises.size > 0 || _saveTimers.size > 0 || !!_sidebarStateTimer;
  },

  selectNote: (id: string | null) => {
    const previousId = get().selectedNoteId;
    _selectionRevision += 1;
    set({ selectedNoteId: id });
    debouncedSaveSidebarState(get().expandedNodes, id);
    if (previousId && previousId !== id) {
      const previousNote = get().notes.find((n) => n.id === previousId);
      if (isLockedByOtherForCurrentUser(previousNote)) {
        discardQueuedCloudWork(previousId);
      } else {
        get().saveNoteById(previousId).catch((e) => {
          console.warn('[Store] 切换页面时保存失败:', e);
        });
      }
    }
    const state = get();
    persistNotesTreeSnapshot(state.notes, state.selectedNoteId, state.expandedNodes);
  },

  updateNote: (id: string, updates: Partial<Note>, opts?: { silent?: boolean; save?: boolean }) => {
    const hasContentUpdate = Object.prototype.hasOwnProperty.call(updates, 'content');
    markNoteChangedLocally(id);

    set((state) => {
      const now = new Date().toISOString();
      const newNotes = state.notes.map((n) => n.id === id ? { ...n, ...updates, updatedAt: now, updated_at: now } : n);
      return { notes: newNotes };
    });

    if (opts?.save !== false) {
      const note = get().notes.find((n) => n.id === id);
      if (note) {
        if (isLockedByOtherForCurrentUser(note)) {
          discardQueuedCloudWork(id);
          return;
        }
        if (hasContentUpdate) {
          saveNoteDraft(note).catch((e) => console.warn('[Store] 本地草稿保存失败:', e));
          debouncedCloudSave(note);
          scheduleBackup(note);
          _editCounters.delete(id);
        } else {
          debouncedCloudSave(note);
        }
      }
    }
  },

  touchNoteUpdatedAt: (id: string, updatedAt?: string) => {
    const nextUpdatedAt = updatedAt || new Date().toISOString();
    markNoteChangedLocally(id);
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id
          ? { ...n, updatedAt: nextUpdatedAt, updated_at: nextUpdatedAt }
          : n
      )
    }));
  },

  setSyncError: (err: string | null) => set({ syncError: err }),

  saveNoteById: async (id: string) => {
    const note = get().notes.find((n) => n.id === id);
    if (note) {
      await flushNoteDrafts(id);
      if (isLockedByOtherForCurrentUser(note)) {
        discardQueuedCloudWork(id);
      } else {
        await flushCloudSaves(note);
        await flushBackups(note);
      }
      _editCounters.delete(id);
    }
  },

  addNote: (parentId: string | null, type: string = 'page', title: string = '新笔记', opts: { skipSelect?: boolean } = {}) => {
    const newNote = sanitizeNote({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title, type, parent_id: parentId,
      order_index: 0,
    });
    markNoteChangedLocally(newNote.id);
    set((state) => ({ notes: [...state.notes, newNote] }));
    if (!opts.skipSelect) {
      _selectionRevision += 1;
      set({ selectedNoteId: newNote.id });
      debouncedSaveSidebarState(get().expandedNodes, newNote.id);
    }
    queueCloudSave(newNote).catch(() => {
      set((state) => ({ notes: state.notes.filter((n) => n.id !== newNote.id) }));
      console.error('[Store] 新建笔记保存失败，已回滚:', newNote.id);
    });
    const state = get();
    persistNotesTreeSnapshot(state.notes, state.selectedNoteId, state.expandedNodes);
    return newNote.id;
  },

  deleteNote: async (id: string) => {
    const deletedNotes = collectNoteAndDescendants(get().notes, id);
    const deletedIds = new Set(deletedNotes.map((note) => note.id));
    // 清除被删笔记及其子笔记的保存队列，防止未完成的保存请求将它们复活
    for (const n of deletedNotes) {
      clearQueuedSavesForNote(n.id);
      markNoteDeletedLocally(n.id);
      deleteNoteDraft(n.id).catch((e) => console.warn('[Store] 删除本地草稿失败:', e));
    }
    set((state) => ({
      notes: state.notes.filter((n) => !deletedIds.has(n.id))
    }));
    persistNotesTreeSnapshot(get().notes, get().selectedNoteId, get().expandedNodes);
    const res = await deleteNoteFromCloud(id);
    if (res && !res.success) {
      for (const n of deletedNotes) {
        _noteLocalDeleteRevisions.delete(n.id);
        markNoteChangedLocally(n.id);
      }
      set((state) => ({ notes: [...state.notes, ...deletedNotes] }));
      console.error('[Store] 删除笔记失败，已恢复:', res.error);
      persistNotesTreeSnapshot(get().notes, get().selectedNoteId, get().expandedNodes);
      return res;
    }
    return res;
  },

  toggleExpanded: (id: string) => {
    set((state) => {
      _expandedRevision += 1;
      const nodes = state.expandedNodes;
      const newExpanded = nodes.includes(id) ? nodes.filter((x) => x !== id) : [...nodes, id];
      debouncedSaveSidebarState(newExpanded, state.selectedNoteId);
      persistNotesTreeSnapshot(state.notes, state.selectedNoteId, newExpanded);
      return { expandedNodes: newExpanded };
    });
  },

  reorderPages: (parentId: string, newOrderIds: string[]) => {
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.parentId === parentId) {
          const idx = newOrderIds.indexOf(n.id);
          if (idx >= 0) {
            markNoteChangedLocally(n.id);
            return { ...n, order: idx };
          }
          return n;
        }
        return n;
      })
    }));
    const notes = get().notes;
    const changed = notes.filter((n) =>
      n.parentId === parentId && newOrderIds.includes(n.id)
    );
    changed.forEach(n => queueCloudSave(n));
    persistNotesTreeSnapshot(get().notes, get().selectedNoteId, get().expandedNodes);
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

  clearLocalCache: () => {
    _selectionRevision += 1;
    _expandedRevision += 1;
    _noteLocalRevision += 1;
    _noteLocalChangeRevisions.clear();
    _noteLocalDeleteRevisions.clear();
    set({ notes: [], selectedNoteId: null, expandedNodes: [], loadingStatus: '已清除缓存' });
    if (isBrowserStorageAvailable()) {
      localStorage.removeItem(NOTES_TREE_SNAPSHOT_KEY);
    }
    clearAllNoteDrafts().catch((e) => console.warn('[Store] 清除本地草稿失败:', e));
  },
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
    const state = get();
    persistNotesTreeSnapshot(state.notes, state.selectedNoteId, state.expandedNodes);
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
    const wasLockedByOther = !!(isLocked && lockedBy && lockedBy !== getCurrentUserId());
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === noteId
          ? { ...n, isLocked, lockedBy, lockedByName }
          : n
      )
    }));
    if (wasLockedByOther) {
      discardQueuedCloudWork(noteId);
    }
    const state = get();
    persistNotesTreeSnapshot(state.notes, state.selectedNoteId, state.expandedNodes);
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

  triggerFolderRefresh: (noteId?: string | null) => {
    set((state) => ({
      folderRefreshTrigger: state.folderRefreshTrigger + 1,
      folderRefreshNoteId: noteId || null,
    }));
  },
}));

// 导出缓存和编辑标记
export const getUpdateLogsCache = () => _updateLogsCache;
export const setUpdateLogsCache = (logs: any[]) => { _updateLogsCache = logs; };
export const markNoteAsEditing = (id: string) => { _editingNotes.add(id); };
export const markNoteAsEditingEnd = (id: string) => { _editingNotes.delete(id); };
