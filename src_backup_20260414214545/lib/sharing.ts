/**
 * 笔记本分享服务
 * 通过 Edge Functions 访问数据库，替代直接使用 serviceClient
 */
import * as edgeApi from './edgeApi';

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
  const result = await edgeApi.apiGetNotebookShares(notebookId);
  if (!result.success) {
    console.error('获取分享列表失败:', result.error);
    return [];
  }
  return result.data || [];
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

    const result = await edgeApi.apiShareNotebook(notebookId, userEmail, permission);
    return result;
  } catch (err: any) {
    console.error('分享失败:', err);
    return { success: false, error: `分享失败: ${err?.message || '未知错误'}` };
  }
}

// 取消分享
export async function unshareNotebook(notebookId: string, email: string): Promise<boolean> {
  try {
    const result = await edgeApi.apiUnshareNotebook(notebookId, email);
    return result.success;
  } catch (err) {
    console.error('取消分享失败:', err);
    return false;
  }
}

// 获取用户可访问的笔记本（已共享的）
export async function getSharedNotebooks(): Promise<{ note_id: string; permission: string }[]> {
  try {
    const result = await edgeApi.apiGetSharedNotebooks();
    if (!result.success) {
      console.error('获取共享笔记本失败:', result.error);
      return [];
    }
    return result.data || [];
  } catch (err) {
    console.error('获取共享笔记本失败:', err);
    return [];
  }
}
