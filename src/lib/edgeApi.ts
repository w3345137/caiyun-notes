/**
 * Edge Functions API 客户端
 * 统一调用后端 Edge Functions，替代直接使用 serviceClient
 */
import { getCurrentUserId } from './auth';

const SUPABASE_URL = 'https://mdtbszztcmmdbnvosvpl.supabase.co';

// Edge Functions 基础 URL
const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * 调用 Edge Function 的统一方法
 */
async function callEdgeFunction<T = any>(
  functionName: string,
  payload: Record<string, any>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const userId = getCurrentUserId();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 秒超时

    const response = await fetch(`${EDGE_FUNCTIONS_URL}/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userId}`, // 传递 userId 用于服务端验证
      },
      body: JSON.stringify({
        userId,
        ...payload,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || `HTTP ${response.status}` };
    }

    return result;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error(`[API] ${functionName} 请求超时`);
      return { success: false, error: '请求超时，请检查网络后重试' };
    }
    console.error(`[API] ${functionName} 调用失败:`, err);
    return { success: false, error: err?.message || '网络错误' };
  }
}

// ========== 笔记查询 API ==========

export async function apiLoadFullTree() {
  return callEdgeFunction('notes-query', { action: 'loadFullTree' });
}

export async function apiBatchUpdateOrder(items: { id: string; order: number }[]) {
  return callEdgeFunction('notes-query', { action: 'batchUpdateOrder', items });
}

export async function apiLoadSidebarState() {
  return callEdgeFunction('notes-query', { action: 'loadSidebarState' });
}

export async function apiSaveSidebarState(expandedNodes: string[], selectedNoteId: string | null) {
  return callEdgeFunction('notes-query', {
    action: 'saveSidebarState',
    expandedNodes,
    selectedNoteId,
  });
}

export async function apiRestoreSidebarState(selectedNoteId: string) {
  return callEdgeFunction('notes-query', {
    action: 'restoreSidebarState',
    selectedNoteId,
  });
}

// ========== 笔记写入 API ==========

export async function apiSaveNote(note: any) {
  return callEdgeFunction('notes-write', { action: 'saveNote', note });
}

export async function apiDeleteNote(noteId: string, allDescendantIds?: Set<string>) {
  return callEdgeFunction('notes-write', {
    action: 'deleteNote',
    noteId,
    allDescendantIds: allDescendantIds ? [...allDescendantIds] : undefined,
  });
}

// ========== 分享查询 API ==========

export async function apiGetNotebookShares(notebookId: string) {
  return callEdgeFunction('shares-query', { action: 'getNotebookShares', notebookId });
}

export async function apiGetSharedNotebooks() {
  return callEdgeFunction('shares-query', { action: 'getSharedNotebooks' });
}

export async function apiGetSharedNotebookIds() {
  return callEdgeFunction<string[]>('shares-query', { action: 'getSharedNotebookIds' });
}

export async function apiGetUserByEmail(email: string) {
  return callEdgeFunction('shares-query', { action: 'getUserByEmail', email });
}

// ========== 分享写入 API ==========

export async function apiShareNotebook(notebookId: string, email: string, permission: 'view' | 'edit' = 'edit') {
  return callEdgeFunction('shares-write', { action: 'shareNotebook', notebookId, email, permission });
}

export async function apiUnshareNotebook(notebookId: string, email: string) {
  return callEdgeFunction('shares-write', { action: 'unshareNotebook', notebookId, email });
}

export async function apiAddShareRecord(noteId: string, targetUserId: string, permission: 'view' | 'edit', sharedBy: string) {
  return callEdgeFunction('shares-write', {
    action: 'addShareRecord',
    noteId,
    targetUserId,
    permission,
    sharedBy,
  });
}

// ========== 邀请管理 API ==========

export async function apiGetReceivedInvites() {
  return callEdgeFunction('invites-manage', { action: 'getReceivedInvites' });
}

export async function apiGetInviteDetail(inviteId: string) {
  return callEdgeFunction('invites-manage', { action: 'getInviteDetail', inviteId });
}

export async function apiGetMyNotebooks() {
  return callEdgeFunction('invites-manage', { action: 'getMyNotebooks' });
}

export async function apiGetNotebookInfo(notebookId: string) {
  return callEdgeFunction('invites-manage', { action: 'getNotebookInfo', notebookId });
}

export async function apiGetPendingCount() {
  return callEdgeFunction('invites-manage', { action: 'getPendingCount' });
}

export async function apiRespondToInvite(
  inviteId: string,
  responseAction: 'approve' | 'reject',
  grantedPermission?: 'view' | 'edit'
) {
  return callEdgeFunction('invites-manage', {
    action: 'respondToInvite',
    inviteId,
    responseAction,
    grantedPermission,
  });
}

// ========== 页面锁管理 API ==========

export async function apiLockNote(noteId: string, userName: string) {
  return callEdgeFunction('locks-manage', { action: 'lockNote', noteId, userName });
}

export async function apiUnlockNote(noteId: string, isOwner: boolean) {
  return callEdgeFunction('locks-manage', { action: 'unlockNote', noteId, isOwner });
}

export async function apiRefreshLock(noteId: string) {
  return callEdgeFunction('locks-manage', { action: 'refreshLock', noteId });
}

export async function apiGetPageLock(noteId: string) {
  return callEdgeFunction('locks-manage', { action: 'getPageLock', noteId });
}

export async function apiRemoveLocksForUser(notebookId: string) {
  return callEdgeFunction('locks-manage', { action: 'removeLocksForUser', notebookId });
}