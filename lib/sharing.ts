import { supabase, serviceClient } from './supabase';

export interface NotebookShare {
  id: string;
  note_id: string;
  share_type: string;
  user_id: string;
  permission: 'view' | 'edit';
  created_at: string;
}

// 获取笔记本的分享列表
export async function getNotebookShares(notebookId: string): Promise<NotebookShare[]> {
  const { data, error } = await serviceClient
    .from('note_shares')
    .select('*')
    .eq('note_id', notebookId);

  if (error) {
    console.error('获取分享列表失败:', error);
    return [];
  }
  return data || [];
}

// 分享笔记本给用户
export async function shareNotebookToUser(
  notebookId: string,
  userEmail: string,
  permission: 'view' | 'edit' = 'edit'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: '用户未登录' };
    }

    // 通过 email 获取被分享者的 profile ID
    const { data: profile, error: profileError } = await serviceClient
      .from('user_profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (profileError || !profile) {
      return { success: false, error: `未找到用户 ${userEmail}` };
    }

    const { error } = await serviceClient
      .from('note_shares')
      .upsert({
        note_id: notebookId,
        share_type: 'user',
        user_id: profile.id,
        permission,
        shared_by: user.id,
      });

    if (error) {
      console.error('分享失败:', error);
      if (error.code === '23505') {
        return { success: false, error: '该用户已在共享列表中' };
      }
      return { success: false, error: `分享失败: ${error.message}` };
    }

    return { success: true };
  } catch (err: any) {
    console.error('分享失败:', err);
    return { success: false, error: `分享失败: ${err?.message || '未知错误'}` };
  }
}

// 取消分享
export async function unshareNotebook(notebookId: string, email: string): Promise<boolean> {
  try {
    // 先通过 email 获取用户的 profile ID
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (!profile) return false;

    const { error } = await serviceClient
      .from('note_shares')
      .delete()
      .eq('note_id', notebookId)
      .eq('user_id', profile.id)
      .eq('share_type', 'user');

    if (error) {
      console.error('取消分享失败:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('取消分享失败:', err);
    return false;
  }
}

// 获取用户可访问的笔记本（已共享的）
export async function getSharedNotebooks(): Promise<{ note_id: string; permission: string }[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // 使用 serviceClient 绕过 RLS 查询 note_shares
    const { data, error } = await serviceClient
      .from('note_shares')
      .select('note_id, permission')
      .eq('user_id', user.id)
      .eq('share_type', 'user');

    if (error) {
      console.error('获取共享笔记本失败:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('获取共享笔记本失败:', err);
    return [];
  }
}
