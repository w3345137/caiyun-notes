/**
 * 笔记本邀请服务
 * 通过本地后端 /invites-manage 访问数据库
 */
import { getCurrentUserId } from './auth';
import * as edgeApi from './edgeApi';

export interface NotebookInvite {
  id: string;
  notebook_id: string;
  shared_by: string;
  target_user_id: string;
  permission: 'view' | 'edit';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  notebook_title?: string;
  inviter_email?: string;
  inviter_name?: string;
}

export async function getReceivedInvites(): Promise<NotebookInvite[]> {
  try {
    const userId = getCurrentUserId();
    if (!userId) return [];

    const result = await edgeApi.apiGetReceivedInvites();
    if (!result.success) {
      console.error('获取收到的邀请失败:', result.error);
      return [];
    }

    return (result.data || []).map((inv: any) => ({
      id: inv.id,
      notebook_id: inv.notebook_id,
      shared_by: inv.shared_by,
      target_user_id: inv.target_user_id,
      permission: inv.permission || 'edit',
      status: inv.status || 'pending',
      created_at: inv.created_at,
      notebook_title: inv.notebook_title,
      inviter_email: inv.inviter_email,
      inviter_name: inv.inviter_name,
    }));
  } catch (err) {
    console.error('获取收到的邀请失败:', err);
    return [];
  }
}

export async function getMyInvites(): Promise<NotebookInvite[]> {
  try {
    const userId = getCurrentUserId();
    if (!userId) return [];

    const result = await edgeApi.apiGetMyInvites();
    if (!result.success) {
      console.error('获取发出的邀请失败:', result.error);
      return [];
    }

    return (result.data || []).map((inv: any) => ({
      id: inv.id,
      notebook_id: inv.notebook_id,
      shared_by: inv.shared_by,
      target_user_id: inv.target_user_id,
      permission: inv.permission || 'edit',
      status: inv.status || 'pending',
      created_at: inv.created_at,
      notebook_title: inv.notebook_title,
    }));
  } catch (err) {
    console.error('获取发出的邀请失败:', err);
    return [];
  }
}

export async function createInvite(
  notebookId: string,
  permission: 'view' | 'edit'
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = getCurrentUserId();
    if (!userId) return { success: false, error: '请先登录' };

    const notebookInfo = await edgeApi.apiGetNotebookInfo(notebookId);
    if (!notebookInfo.success || !notebookInfo.data) {
      return { success: false, error: '笔记本不存在' };
    }
    if (notebookInfo.data.owner_id === userId) {
      return { success: false, error: '不能申请加入自己的笔记本' };
    }

    const ownerId = notebookInfo.data.owner_id;
    const result = await edgeApi.apiCreateInvite(notebookId, ownerId, permission);
    if (!result.success) {
      return { success: false, error: result.error || '创建邀请失败' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('创建邀请失败:', err);
    return { success: false, error: err?.message || '创建邀请失败' };
  }
}

export async function respondToInvite(
  inviteId: string,
  action: 'approve' | 'reject',
  grantedPermission?: 'view' | 'edit'
): Promise<{ success: boolean; error?: string }> {
  const accept = action === 'approve';
  const result = await edgeApi.apiRespondToInvite(inviteId, accept, grantedPermission);
  return result;
}

export async function cancelInvite(inviteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = getCurrentUserId();
    if (!userId) return { success: false, error: '请先登录' };

    const result = await edgeApi.apiCancelInvite(inviteId);
    if (!result.success) {
      return { success: false, error: result.error || '取消邀请失败' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('取消邀请失败:', err);
    return { success: false, error: err?.message || '取消邀请失败' };
  }
}

export async function getPendingInviteCount(): Promise<number> {
  try {
    const result = await edgeApi.apiGetPendingCount();
    if (!result.success) return 0;
    return result.data?.count || 0;
  } catch {
    return 0;
  }
}
