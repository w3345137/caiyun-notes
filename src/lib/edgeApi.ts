/**
 * 本地后端 API 客户端 (全面替代 Supabase + Edge Functions)
 * 所有数据操作通过本地后端 /api/* 完成
 */
import { getCurrentUserId } from './auth';

const API_BASE = '/api';
function getToken() { return localStorage.getItem('notesapp_token'); }

async function call(path: string, payload: any = {}): Promise<any> {
  const token = getToken();
  if (!token) return { success: false, error: '未登录' };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: getCurrentUserId(), ...payload })
    });
    if (res.status === 401) {
      localStorage.removeItem('notesapp_token');
      return { success: false, error: '登录已过期，请重新登录' };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `请求失败(${res.status})` };
    }
    return await res.json();
  } catch (e: any) { return { success: false, error: e.message }; }
}

// === 核心数据映射 ===
export const apiLoadFullTree = () => call('/notes-query', { action: 'loadFullTree' });
export const apiSaveNote = (note: any, v?: number) => call('/notes-write', { action: 'saveNote', note, expectedVersion: v });
export const apiDeleteNote = (id: string, d?: string[]) => call('/notes-write', { action: 'deleteNote', noteId: id, allDescendantIds: d });
export const apiBatchUpdateOrder = (items: any[]) => call('/notes-query', { action: 'batchUpdateOrder', items });
export const apiLoadSidebarState = () => call('/notes-query', { action: 'loadSidebarState' });
export const apiSaveSidebarState = (e: string[], s: string | null) => call('/notes-query', { action: 'saveSidebarState', expandedNodes: e, selectedNoteId: s });

// === 锁管理 ===
export const apiLockNote = (noteId: string, userName: string) => call('/locks-manage', { action: 'lockNote', noteId, userName });
export const apiUnlockNote = (noteId: string, isOwner?: boolean) => call('/locks-manage', { action: 'unlockNote', noteId, isOwner });
export const apiRefreshLock = (noteId: string) => call('/locks-manage', { action: 'refreshLock', noteId });
export const apiGetPageLock = (noteId: string) => call('/locks-manage', { action: 'getPageLock', noteId });
export const apiRemoveLocksForUser = (notebookId: string, userId: string) => call('/locks-manage', { action: 'removeLocksForUser', notebookId, userId });

// === 共享映射 ===
export const apiGetNotebookShares = (id: string) => call('/shares-query', { action: 'getNotebookShares', notebookId: id });
export const apiShareNotebook = (id: string, email: string, p: string) => call('/shares-write', { action: 'shareNotebook', notebookId: id, email, permission: p });
export const apiUnshareNotebook = (id: string, email: string) => call('/shares-write', { action: 'unshareNotebook', notebookId: id, email });
export const apiGetSharedNotebookIds = () => call('/shares-query', { action: 'getSharedNotebookIds' });
export const apiGetSharedNotebooks = () => call('/shares-query', { action: 'getSharedNotebooks' });

// === 邀请映射 (走本地后端 /invites-manage) ===
export const apiGetReceivedInvites = () => call('/invites-manage', { action: 'getReceivedInvites' });
export const apiGetMyInvites = () => call('/invites-manage', { action: 'getMyInvites' });
export const apiGetPendingCount = () => call('/invites-manage', { action: 'getPendingInviteCount' });
export const apiCreateInvite = (notebookId: string, inviteeUserId: string, permission: string) => call('/invites-manage', { action: 'createInvite', notebookId, inviteeUserId, permission });
export const apiRespondToInvite = (inviteId: string, accept: boolean, permission?: string) => 
  call('/invites-manage', { action: 'respondToInvite', inviteId, accept, permission });
export const apiCancelInvite = (inviteId: string) => call('/invites-manage', { action: 'cancelInvite', inviteId });
export const apiGetNotebookInfo = async (id?: string) => {
  if (!id) return { success: false, data: null };
  const result = await call('/notes-query', { action: 'getNoteById', noteId: id });
  return result;
};

// === 兼容旧版别名 ===
export const loadFullTree = apiLoadFullTree;
export const saveNoteToCloud = apiSaveNote;
export const deleteNoteFromCloud = apiDeleteNote;
export const batchUpdateOrder = apiBatchUpdateOrder;
export const loadSidebarState = apiLoadSidebarState;
export const saveSidebarState = apiSaveSidebarState;

// === 云存储切换 ===
export const apiSetCloudProvider = async (notebookId: string, provider: string | null) => {
  return call('/notes-query', { action: 'setCloudProvider', notebook_id: notebookId, provider });
};
export const apiGetCloudProvider = async (notebookId: string) => {
  return call('/notes-query', { action: 'getCloudProvider', notebook_id: notebookId });
};
