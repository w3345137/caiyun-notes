/**
 * Admin Console API - 前端接口
 * 所有管理操作通过 Edge Function 执行，避免 service_role key 暴露
 * 使用 Supabase access_token 进行身份验证
 */
import { getCurrentUserId } from './auth';
import { supabase } from './supabase';

const SUPABASE_URL = 'https://mdtbszztcmmdbnvosvpl.supabase.co';
const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * 调用 admin-api Edge Function
 */
async function callAdminApi<T = any>(
  action: string,
  params: Record<string, any> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const userId = getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { success: false, error: 'No access token' };
  }

  try {
    const response = await fetch(`${EDGE_FUNCTIONS_URL}/admin-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
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
    return { success: false, error: err?.message || 'Network error' };
  }
}

// ========== 管理员身份验证 ==========

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const ADMIN_EMAILS = ['767493611@qq.com'];
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const result = await callAdminApi<boolean>('checkIsAdmin');
  return result.success && result.data === true;
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
