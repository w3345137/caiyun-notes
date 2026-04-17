/**
 * Admin Console API - 本地后端版本
 * 所有管理操作通过本地后端 /api/admin 执行
 */

const API_BASE = '/api';

/**
 * 获取本地 JWT token
 */
function getToken(): string | null {
  return localStorage.getItem('notesapp_token');
}

/**
 * 调用本地管理员 API
 */
async function callAdminApi<T = any>(
  action: string,
  params: Record<string, any> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = getToken();
  if (!token) {
    return { success: false, error: '未登录' };
  }

  try {
    const response = await fetch(`${API_BASE}/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        action,
        ...params,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || `HTTP ${response.status}` };
    }

    return result;
  } catch (err: any) {
    console.error(`[AdminAPI] ${action} 调用失败:`, err);
    return { success: false, error: err?.message || '网络错误' };
  }
}

// ========== 管理员身份验证 ==========

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const ADMIN_EMAILS = ['767493611@qq.com'];
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function checkIsAdmin(): Promise<boolean> {
  const result = await callAdminApi<boolean>('getDbStats');
  return result.success;
}

// ========== 用户管理 ==========

export interface UserRecord {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  note_count: number;
  is_admin: boolean;
}

export async function getAllUsers(): Promise<UserRecord[]> {
  const result = await callAdminApi<UserRecord[]>('getAllUsers');
  return result.success ? result.data || [] : [];
}

export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
  return callAdminApi('deleteUser', { targetUserId: userId });
}

// ========== 数据库统计 ==========

export interface DbStats {
  total_users: number;
  total_notes: number;
  total_sessions: number;
  db_size_mb: number;
  top_users: { email: string; note_count: number }[];
}

export async function getDbStats(): Promise<DbStats> {
  const result = await callAdminApi<DbStats>('getDbStats');
  return result.success && result.data ? result.data : {
    total_users: 0,
    total_notes: 0,
    total_sessions: 0,
    db_size_mb: 0,
    top_users: [],
  };
}

// ========== 所有笔记浏览 ==========

export interface NoteRecord {
  id: string;
  title: string;
  type: string;
  owner_email: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  word_count: number;
}

export async function getAllNotes(): Promise<NoteRecord[]> {
  const result = await callAdminApi<NoteRecord[]>('getAllNotes');
  return result.success ? result.data || [] : [];
}

export async function deleteAnyNote(noteId: string): Promise<{ success: boolean; error?: string }> {
  return callAdminApi('deleteAnyNote', { noteId });
}

// ========== 活跃度统计 ==========

export interface ActivityStat {
  date: string;
  new_users: number;
  new_notes: number;
}

export async function getActivityStats(days: number = 30): Promise<ActivityStat[]> {
  const result = await callAdminApi<ActivityStat[]>('getActivityStats', { days });
  return result.success ? result.data || [] : [];
}
