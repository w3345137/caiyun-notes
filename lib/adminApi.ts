/**
 * Admin Console API - 管理员接口（懒加载版）
 * service_role key 有数据库完整访问权限
 */
import type { Note } from '../types';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdGJzenp0Y21tZGJudm9zdnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAwODQ2MywiZXhwIjoyMDg5NTg0NDYzfQ.seqAEkNgW0Bo7Zwxx53SpXHe8T82b_WVtUK9z85vO9Q';

let _sbAdmin: any = null;
async function getSbAdmin() {
  if (!_sbAdmin) {
    const { createClient } = await import('@supabase/supabase-js');
    _sbAdmin = createClient(
      'https://mdtbszztcmmdbnvosvpl.supabase.co',
      SERVICE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _sbAdmin;
}

// ========== 管理员身份验证 ==========
const ADMIN_EMAILS = ['767493611@qq.com'];

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const sb = await getSbAdmin();
  const { data } = await sb.from('user_profiles').select('email').eq('id', userId).single();
  return data ? isAdminEmail(data.email) : false;
}

// ========== 用户管理 ==========
export interface UserRecord {
  id: string; email: string; display_name: string | null;
  created_at: string; note_count: number; is_admin: boolean;
}

export async function getAllUsers(): Promise<UserRecord[]> {
  const sb = await getSbAdmin();
  const { data: profiles } = await sb.from('user_profiles').select('*').order('created_at', { ascending: false });
  if (!profiles) return [];
  const userIds = profiles.map((p: any) => p.id);
  const { data: notes } = await sb.from('notes').select('owner_id');
  const countMap: Record<string, number> = {};
  (notes || []).forEach((n: any) => { countMap[n.owner_id] = (countMap[n.owner_id] || 0) + 1; });
  return profiles.map((p: any) => ({
    id: p.id, email: p.email,
    display_name: p.display_name || p.email.split('@')[0],
    created_at: p.created_at,
    note_count: countMap[p.id] || 0,
    is_admin: isAdminEmail(p.email),
  }));
}

export async function deleteUser(userId: string): Promise<void> {
  const sb = await getSbAdmin();
  await sb.from('notes').delete().eq('owner_id', userId);
  await sb.from('note_shares').delete().eq('shared_by', userId);
  const { error } = await sb.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

// ========== 数据库统计 ==========
export interface DbStats {
  total_users: number; total_notes: number; total_sessions: number;
  db_size_mb: number; top_users: { email: string; note_count: number }[];
}

export async function getDbStats(): Promise<DbStats> {
  const sb = await getSbAdmin();
  const [{ data: users }, { data: notes }] = await Promise.all([
    sb.from('user_profiles').select('id, email'),
    sb.from('notes').select('owner_id'),
  ]);
  const noteCountMap: Record<string, number> = {};
  (notes || []).forEach((n: any) => { noteCountMap[n.owner_id] = (noteCountMap[n.owner_id] || 0) + 1; });
  const emailMap: Record<string, string> = {};
  (users || []).forEach((u: any) => { emailMap[u.id] = u.email; });
  const topUsers = Object.entries(noteCountMap)
    .map(([owner_id, note_count]) => ({ email: emailMap[owner_id] || owner_id, note_count }))
    .sort((a, b) => b.note_count - a.note_count).slice(0, 5);
  return { total_users: (users || []).length, total_notes: (notes || []).length, total_sessions: 0, db_size_mb: 0, top_users: topUsers };
}

// ========== 所有笔记浏览 ==========
export interface NoteRecord {
  id: string; title: string; type: string;
  owner_email: string; owner_id: string;
  created_at: string; updated_at: string; word_count: number;
}

export async function getAllNotes(): Promise<NoteRecord[]> {
  const sb = await getSbAdmin();
  const { data: notes } = await sb.from('notes').select('*').order('updated_at', { ascending: false }).limit(200);
  if (!notes) return [];
  const ownerIds = [...new Set(notes.map((n: any) => n.owner_id))];
  const { data: profiles } = await sb.from('user_profiles').select('id, email').in('id', ownerIds.length > 0 ? ownerIds : ['__none__']);
  const emailMap: Record<string, string> = {};
  (profiles || []).forEach((p: any) => { emailMap[p.id] = p.email; });
  return notes.map((n: any) => ({
    id: n.id, title: n.title, type: n.type,
    owner_email: emailMap[n.owner_id] || n.owner_id, owner_id: n.owner_id,
    created_at: n.created_at, updated_at: n.updated_at,
    word_count: (n.content || '').replace(/<[^>]+>/g, '').length,
  }));
}

export async function deleteAnyNote(noteId: string): Promise<void> {
  const sb = await getSbAdmin();
  const { error } = await sb.from('notes').delete().eq('id', noteId);
  if (error) throw new Error(error.message);
}

// ========== 活跃度统计 ==========
export interface ActivityStat { date: string; new_users: number; new_notes: number; }

export async function getActivityStats(days: number = 30): Promise<ActivityStat[]> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const sb = await getSbAdmin();
  const [{ data: users }, { data: notes }] = await Promise.all([
    sb.from('user_profiles').select('created_at').gte('created_at', cutoffStr),
    sb.from('notes').select('created_at').gte('created_at', cutoffStr),
  ]);
  const userCountByDate: Record<string, number> = {};
  const noteCountByDate: Record<string, number> = {};
  (users || []).forEach((u: any) => { const d = u.created_at.split('T')[0]; userCountByDate[d] = (userCountByDate[d] || 0) + 1; });
  (notes || []).forEach((n: any) => { const d = n.created_at.split('T')[0]; noteCountByDate[d] = (noteCountByDate[d] || 0) + 1; });
  const allDates = new Set([...Object.keys(userCountByDate), ...Object.keys(noteCountByDate)]);
  return Array.from(allDates).sort().map(date => ({
    date, new_users: userCountByDate[date] || 0, new_notes: noteCountByDate[date] || 0,
  }));
}
