/**
 * 笔记本分享申请服务
 * notebook_invites 表的 CRUD 操作
 */
import { supabase, serviceClient } from './supabase';

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

    // 先获取当前用户拥有的笔记本ID列表
    const { data: myNotebooks } = await serviceClient
      .from('notes')
      .select('id')
      .eq('owner_id', user.id)
      .eq('type', 'notebook');

    console.log('[getReceivedInvites] 我的笔记本:', myNotebooks);

    const notebookIds = myNotebooks?.map(n => n.id) || [];
    console.log('[getReceivedInvites] 笔记本 IDs:', notebookIds);
    
    if (notebookIds.length === 0) {
      return [];
    }

    // 使用 serviceClient 查找这些笔记本收到的申请（不用嵌入关系）
    const { data, error } = await serviceClient
      .from('notebook_invites')
      .select('*')
      .in('notebook_id', notebookIds)
      .order('created_at', { ascending: false });

    console.log('[getReceivedInvites] 查询结果:', data, error);

    if (error) {
      console.error('获取收到的申请失败:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 手动获取关联数据
    const result: NotebookInvite[] = [];
    for (const invite of data) {
      // 获取笔记本标题
      const { data: notebook } = await serviceClient
        .from('notes')
        .select('title')
        .eq('id', invite.notebook_id)
        .single();
      
      // 获取申请者信息
      const { data: requester } = await serviceClient
        .from('user_profiles')
        .select('display_name, email')
        .eq('id', invite.requester_id)
        .single();

      result.push({
        ...invite,
        notebook_title: notebook?.title,
        requester_email: requester?.email,
        requester_name: requester?.display_name,
      });
    }

    return result;
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

    // 手动获取笔记本标题
    const result: NotebookInvite[] = [];
    for (const invite of data) {
      const { data: notebook } = await serviceClient
        .from('notes')
        .select('title')
        .eq('id', invite.notebook_id)
        .single();

      result.push({
        ...invite,
        notebook_title: notebook?.title,
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

    // 检查笔记本是否存在且是 notebook 类型
    const { data: notebook, error: notebookError } = await serviceClient
      .from('notes')
      .select('id, title, owner_id')
      .eq('id', notebookId)
      .eq('type', 'notebook')
      .single();

    if (notebookError || !notebook) {
      return { success: false, error: '笔记本不存在' };
    }

    // 不能申请自己的笔记本
    if (notebook.owner_id === user.id) {
      return { success: false, error: '不能申请加入自己的笔记本' };
    }

    // 检查是否已有待处理的申请
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
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: '请先登录' };
    }

    // 获取申请详情
    const { data: invite, error: inviteError } = await serviceClient
      .from('notebook_invites')
      .select('*')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invite) {
      return { success: false, error: '申请不存在' };
    }

    // 获取笔记本信息（手动查询）
    const { data: notebookData } = await serviceClient
      .from('notes')
      .select('title, owner_id')
      .eq('id', invite.notebook_id)
      .single();
    
    // 验证是否是笔记本所有者
    if (notebookData?.owner_id !== user.id) {
      return { success: false, error: '只有笔记本所有者可以审批' };
    }

    if (invite.status !== 'pending') {
      return { success: false, error: '该申请已被处理' };
    }

    if (action === 'approve') {
      // 实际授予的权限（如果没指定，则用申请人申请的权限）
      const actualPermission = grantedPermission ?? invite.permission;

      // 1. 在 note_shares 中添加分享记录
      const { error: shareError } = await serviceClient
        .from('note_shares')
        .insert({
          note_id: invite.notebook_id,
          share_type: 'user',
          user_id: invite.requester_id,
          permission: actualPermission,
          shared_by: user.id,
        });

      if (shareError) {
        console.error('创建分享记录失败:', shareError);
        if (shareError.code === '23505') {
          return { success: false, error: '该用户已在共享列表中' };
        }
        return { success: false, error: `审批失败: ${shareError.message}` };
      }

      // 2. 更新申请状态为 approved，同时记录实际授予的权限
      const { error: updateError } = await serviceClient
        .from('notebook_invites')
        .update({
          status: 'approved',
          responded_by: user.id,
          responded_at: new Date().toISOString(),
          permission: actualPermission, // 更新为实际授予的权限
        })
        .eq('id', inviteId);

      if (updateError) {
        console.error('更新申请状态失败:', updateError);
        return { success: false, error: '审批失败' };
      }
    } else {
      // 拒绝：更新状态为 rejected
      const { error: updateError } = await serviceClient
        .from('notebook_invites')
        .update({
          status: 'rejected',
          responded_by: user.id,
          responded_at: new Date().toISOString(),
        })
        .eq('id', inviteId);

      if (updateError) {
        console.error('更新申请状态失败:', updateError);
        return { success: false, error: '操作失败' };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('审批申请失败:', err);
    return { success: false, error: err?.message || '操作失败' };
  }
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

    // 先获取当前用户拥有的笔记本ID列表
    const { data: myNotebooks } = await serviceClient
      .from('notes')
      .select('id')
      .eq('owner_id', user.id)
      .eq('type', 'notebook');

    const notebookIds = myNotebooks?.map(n => n.id) || [];
    
    if (notebookIds.length === 0) {
      return 0;
    }

    const { data, error } = await serviceClient
      .from('notebook_invites')
      .select('id', { count: 'exact' })
      .in('notebook_id', notebookIds)
      .eq('status', 'pending');

    if (error) {
      console.error('获取待处理申请数量失败:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (err) {
    console.error('获取待处理申请数量失败:', err);
    return 0;
  }
}
