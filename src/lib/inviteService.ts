/**
 * 笔记本分享申请服务
 * 通过 Edge Functions 访问数据库，替代直接使用 serviceClient
 * notebook_invites 表的 CRUD 操作
 */
import { supabase } from './supabase';
import { getCurrentUserId } from './auth';
import * as edgeApi from './edgeApi';

export interface NotebookInvite {
  id: string;
  notebook_id: string;
  requester_id: string;
  permission: 'view' | 'edit';
  status: 'pending' | 'approved' | 'rejected';
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  // 关联数据
  notebook_title?: string;
  requester_email?: string;
  requester_name?: string;
  responded_by_name?: string;
}

// 获取当前用户收到的申请（作为笔记本所有者）
export async function getReceivedInvites(): Promise<NotebookInvite[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    console.log('[getReceivedInvites] 当前用户 ID:', user.id);

    const result = await edgeApi.apiGetReceivedInvites();

    if (!result.success) {
      console.error('获取收到的申请失败:', result.error);
      return [];
    }

    console.log('[getReceivedInvites] 查询结果:', result.data);
    return result.data || [];
  } catch (err) {
    console.error('获取收到的申请失败:', err);
    return [];
  }
}

// 获取当前用户发出的申请
export async function getMyInvites(): Promise<NotebookInvite[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('notebook_invites')
      .select('*')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取我的申请失败:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 手动获取笔记本标题（需要使用 Edge Function 绕过 RLS）
    const result: NotebookInvite[] = [];
    for (const invite of data) {
      const infoResult = await edgeApi.apiGetNotebookInfo(invite.notebook_id);
      result.push({
        ...invite,
        notebook_title: infoResult.data?.title,
      });
    }

    return result;
  } catch (err) {
    console.error('获取我的申请失败:', err);
    return [];
  }
}

// 创建申请（申请加入别人的笔记本）
export async function createInvite(
  notebookId: string,
  permission: 'view' | 'edit'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // 使用 Edge Function 验证笔记本信息
    const notebookInfo = await edgeApi.apiGetNotebookInfo(notebookId);

    if (!notebookInfo.success || !notebookInfo.data) {
      return { success: false, error: '笔记本不存在' };
    }

    // 不能申请自己的笔记本
    if (notebookInfo.data.owner_id === user.id) {
      return { success: false, error: '不能申请加入自己的笔记本' };
    }

    // 检查是否已有待处理的申请（使用 supabase 查询自己的申请）
    const { data: existing } = await supabase
      .from('notebook_invites')
      .select('id, status')
      .eq('notebook_id', notebookId)
      .eq('requester_id', user.id)
      .in('status', ['pending', 'approved'])
      .single();

    if (existing) {
      if (existing.status === 'approved') {
        return { success: false, error: '您已经是该笔记本的成员' };
      }
      return { success: false, error: '您已有待处理的申请' };
    }

    const { error } = await supabase
      .from('notebook_invites')
      .insert({
        notebook_id: notebookId,
        requester_id: user.id,
        permission,
        status: 'pending',
      });

    if (error) {
      console.error('创建申请失败:', error);
      return { success: false, error: `创建申请失败: ${error.message}` };
    }

    return { success: true };
  } catch (err: any) {
    console.error('创建申请失败:', err);
    return { success: false, error: err?.message || '创建申请失败' };
  }
}

// 审批申请（笔记本所有者操作）
// grantedPermission: 实际授予的权限，不传则使用申请人申请的权限
export async function respondToInvite(
  inviteId: string,
  action: 'approve' | 'reject',
  grantedPermission?: 'view' | 'edit'
): Promise<{ success: boolean; error?: string }> {
  const result = await edgeApi.apiRespondToInvite(inviteId, action, grantedPermission);
  return result;
}

// 取消申请（申请者操作）
export async function cancelInvite(inviteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: '请先登录' };
    }

    const { error } = await supabase
      .from('notebook_invites')
      .delete()
      .eq('id', inviteId)
      .eq('requester_id', user.id)
      .eq('status', 'pending');

    if (error) {
      console.error('取消申请失败:', error);
      return { success: false, error: '取消申请失败' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('取消申请失败:', err);
    return { success: false, error: err?.message || '取消申请失败' };
  }
}

// 获取待处理的申请数量（用于红点显示）
export async function getPendingInviteCount(): Promise<number> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const result = await edgeApi.apiGetPendingCount();

    if (!result.success) {
      console.error('获取待处理申请数量失败:', result.error);
      return 0;
    }

    return result.count || 0;
  } catch (err) {
    console.error('获取待处理申请数量失败:', err);
    return 0;
  }
}
