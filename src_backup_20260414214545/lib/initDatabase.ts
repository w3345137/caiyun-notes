/**
 * 云笔记 - 数据库层
 * 通过 Edge Functions 访问数据库，替代直接使用 serviceClient
 *
 * 版本号机制：
 * - 每个笔记有一个 version 字段，初始为 1
 * - 本地修改时 version + 1
 * - 保存时使用 version 进行冲突检测
 */
import { getCurrentUserId, isAuthReady } from './auth';
import type { Note } from '../types';
import { canUserEditPage } from './lockService';
import * as edgeApi from './edgeApi';

export async function initDatabase(): Promise<boolean> {
  try {
    // 使用 Supabase auth 检测连接（不受 RLS 影响）
    const { error } = await supabase.auth.getSession();
    if (error) {
      console.error('数据库连接失败:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('数据库连接异常:', e);
    return false;
  }
}

export async function loadNotesFromCloud(): Promise<Note[]> {
  await isAuthReady();
  const userId = getCurrentUserId();
  if (!userId) {
    console.warn('[DB] loadNotesFromCloud: userId 为空，跳过加载');
    return [];
  }

  console.log('[DB] === loadNotesFromCloud ===');
  console.log('[DB] 当前用户ID:', userId);

  // 使用 Edge Function 加载完整笔记树
  const result = await edgeApi.apiLoadFullTree();

  if (!result.success) {
    console.error('[DB] 加载笔记失败:', result.error);
    return [];
  }

  const deduplicated = result.data || [];
  console.log('[DB] 最终加载笔记数量:', deduplicated.length);
  // 分类统计
  const byType = deduplicated.reduce((acc: Record<string, number>, n: any) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  console.log('[DB] 分类统计:', byType);
  // 统计被锁页面
  const lockedPages = deduplicated.filter((n: any) => n.type === 'page' && n.is_locked);
  console.log('[DB] 被锁定页面:', lockedPages.length, lockedPages.map((n: any) => `id=${n.id} locked_by=${n.locked_by}`));
  // 打印所有页面 ID（调试用）
  const pages = deduplicated.filter((n: any) => n.type === 'page');
  console.log('[DB] 所有页面:', pages.map((n: any) => n.id));

  return deduplicated.map(normalizeNote);
}

export async function syncAllNotesToCloud(notes: Note[]): Promise<{ success: boolean; error?: string }> {
  await isAuthReady();
  const userId = getCurrentUserId();
  if (!userId) {
    console.warn('[DB] syncAllNotesToCloud: userId 为空');
    return { success: false, error: '用户未登录' };
  }
  if (notes.length === 0) return { success: true };

  // 使用 Edge Function 批量保存（绕过 RLS）
  try {
    for (const note of notes) {
      const result = await edgeApi.apiSaveNote(note);
      if (!result.success) {
        console.error('[DB] 批量同步失败:', result.error);
        return { success: false, error: result.error };
      }
    }
    console.log('[DB] 批量同步成功:', notes.length, '条');
    return { success: true };
  } catch (err) {
    console.error('[DB] 批量同步异常:', err);
    return { success: false, error: String(err) };
  }
}

export async function saveNoteToCloud(note: Note, expectedVersion?: number): Promise<{ success: boolean; error?: string; conflictInfo?: { serverVersion: number; clientVersion: number } }> {
  const userId = getCurrentUserId();
  if (!userId) {
    console.warn('[DB] saveNoteToCloud: userId 为空，不保存');
    return { success: false, error: '用户未登录' };
  }

  // 页面锁检查：只有页面才检查锁
  if (note.type === 'page') {
    const { canEdit, lockedByName } = await canUserEditPage(note.id, userId, false);
    if (!canEdit) {
      console.warn(`[DB] 保存被锁定页面拦截: id=${note.id}, lockedBy=${lockedByName}`);
      return { success: false, error: `该页面已被 ${lockedByName || '其他人'} 锁定，无法保存` };
    }
  }

  // 使用 Edge Function 保存笔记（带乐观锁版本校验）
  const result = await edgeApi.apiSaveNote(note, expectedVersion);

  if (!result.success) {
    // 版本冲突：返回冲突信息
    if (result.error === 'VERSION_CONFLICT') {
      console.warn(`[DB] 版本冲突: 服务端版本=${result.serverVersion}, 客户端版本=${result.clientVersion}`);
      return {
        success: false,
        error: 'VERSION_CONFLICT',
        conflictInfo: {
          serverVersion: result.serverVersion,
          clientVersion: result.clientVersion,
        },
      };
    }
    console.error('[DB] 保存笔记失败:', result.error);
    return { success: false, error: result.error };
  }

  console.log('[DB] 保存成功并验证 id=', note.id, '版本:', result.version);
  return { success: true };
}

export async function deleteNoteFromCloud(noteId: string, allDescendantIds?: Set<string>): Promise<{ success: boolean; error?: string }> {
  // 使用 Edge Function 删除笔记
  const result = await edgeApi.apiDeleteNote(noteId, allDescendantIds);

  if (!result.success) {
    console.error('[DB] 删除笔记失败:', result.error);
    return { success: false, error: result.error };
  }

  console.log('[DB] 删除成功并验证 id=', noteId);
  return { success: true };
}

// ========== 共享笔记本功能（使用 Edge Functions 绕过 RLS） ==========
export interface ShareRecord {
  id: string; note_id: string; share_type: 'team' | 'user';
  team_id?: string; user_id?: string; permission: 'view' | 'edit';
  shared_by: string; created_at: string; user_email?: string;
}

export async function getNotebookShares(notebookId: string): Promise<ShareRecord[]> {
  const result = await edgeApi.apiGetNotebookShares(notebookId);
  if (!result.success) {
    console.error('[DB] 获取分享列表失败:', result.error);
    return [];
  }
  return result.data || [];
}

/**
 * 批量获取当前用户拥有的所有有共享记录的笔记本 ID
 * 一次查询替代逐个笔记本调用 getNotebookShares
 */
export async function getSharedNotebookIds(): Promise<string[]> {
  const result = await edgeApi.apiGetSharedNotebookIds();
  if (!result.success) {
    console.error('[DB] 获取共享笔记本ID列表失败:', result.error);
    return [];
  }
  return result.data || [];
}

export async function shareNotebook(
  notebookId: string,
  email: string,
  permission: 'view' | 'edit' = 'edit'
): Promise<{ success: boolean; error?: string }> {
  const userId = getCurrentUserId();
  if (!userId) return { success: false, error: '未登录或会话已过期，请重新登录' };

  const result = await edgeApi.apiShareNotebook(notebookId, email, permission);
  return result;
}

export async function unshareNotebook(
  notebookId: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  const result = await edgeApi.apiUnshareNotebook(notebookId, email);
  return result;
}

// ========== 侧边栏状态 API ==========
function normalizeNote(row: any): Note {
  return {
    id: row.id, title: row.title || '无标题', content: row.content || '',
    mindmapData: row.mindmap_data || null, // 思维导图数据
    parentId: row.parent_id || null, type: row.type || 'page',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    order: row.order_index ?? 0, icon: row.icon || 'doc',
    lockedBy: row.locked_by || null, lockedByName: row.locked_by_name || null,
    version: row.version ?? 1, // 版本号，默认为1
    ownerId: row.owner_id || '', // 笔记所有者 ID
    createdBy: row.created_by || '', // 创建者用户ID
    createdByName: row.created_by_name || '', // 创建者名称
    updatedBy: row.updated_by || '', // 最后修改者用户ID
    updatedByName: row.updated_by_name || '', // 最后修改者名称
    rootNotebookId: row.root_notebook_id || null, // 所属顶级笔记本ID
  };
}

// ========== 拖拽排序 API ==========

/**
 * 批量更新笔记的排序顺序
 * @param items 要更新的笔记列表，每个包含 id 和 order（新的排序值）
 */
export async function batchUpdateOrder(items: { id: string; order: number }[]): Promise<{ success: boolean; error?: string }> {
  if (items.length === 0) {
    return { success: true };
  }

  console.log('[DB] batchUpdateOrder - 更新', items.length, '个笔记的顺序');

  const result = await edgeApi.apiBatchUpdateOrder(items);

  if (!result.success) {
    console.error('[DB] 批量更新顺序失败:', result.error);
    return { success: false, error: result.error };
  }

  console.log('[DB] 批量更新顺序成功');
  return { success: true };
}

// ========== 侧边栏状态 API ==========

export interface SidebarState {
  expandedNodes: string[];
  selectedNoteId: string | null;
  updatedAt: string | null;
}

/**
 * 从数据库读取用户的侧边栏状态
 */
export async function loadSidebarState(): Promise<SidebarState | null> {
  await isAuthReady();
  const userId = getCurrentUserId();
  if (!userId) {
    console.warn('[DB] loadSidebarState: userId 为空，跳过加载');
    return null;
  }

  const result = await edgeApi.apiLoadSidebarState();

  if (!result.success) {
    console.error('[DB] 加载侧边栏状态失败:', result.error);
    return null;
  }

  const state = result.data;
  if (!state) {
    console.log('[DB] 侧边栏状态为空，使用默认值');
    return null;
  }

  console.log('[DB] 加载侧边栏状态成功:', state);
  return state;
}

/**
 * 保存用户的侧边栏状态到数据库
 */
export async function saveSidebarState(
  expandedNodes: string[],
  selectedNoteId: string | null
): Promise<{ success: boolean; error?: string }> {
  await isAuthReady();
  const userId = getCurrentUserId();
  if (!userId) {
    console.warn('[DB] saveSidebarState: userId 为空，跳过保存');
    return { success: false, error: '用户未登录' };
  }

  const result = await edgeApi.apiSaveSidebarState(expandedNodes, selectedNoteId);

  if (!result.success) {
    console.error('[DB] 保存侧边栏状态失败:', result.error);
    return { success: false, error: result.error };
  }

  console.log('[DB] 保存侧边栏状态成功');
  return { success: true };
}

// ========== 更新日志 API ==========
// update_logs 表没有 RLS 保护，可以直接使用 supabase

export interface UpdateLog {
  id?: string;
  version: string;
  date: string;
  items: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * 获取所有更新日志（按日期降序）
 */
export async function getUpdateLogs(): Promise<UpdateLog[]> {
  try {
    const { data, error } = await supabase
      .from('update_logs')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('[DB] 获取更新日志失败:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[DB] 获取更新日志异常:', err);
    return [];
  }
}

/**
 * 更新更新日志
 */
export async function updateUpdateLog(
  id: string,
  updateData: Partial<Pick<UpdateLog, 'version' | 'date' | 'items'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('update_logs')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[DB] 更新更新日志失败:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[DB] 更新更新日志异常:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * 添加新更新日志
 */
export async function addUpdateLog(
  logData: Pick<UpdateLog, 'version' | 'date' | 'items'>
): Promise<{ success: boolean; data?: UpdateLog; error?: string }> {
  try {
    const { data: inserted, error } = await supabase
      .from('update_logs')
      .insert([logData])
      .select()
      .single();

    if (error) {
      console.error('[DB] 添加更新日志失败:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: inserted };
  } catch (err) {
    console.error('[DB] 添加更新日志异常:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * 删除更新日志
 */
export async function deleteUpdateLog(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('update_logs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DB] 删除更新日志失败:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[DB] 删除更新日志异常:', err);
    return { success: false, error: String(err) };
  }
}
