/**
 * 云笔记 - 数据库层
 * 普通操作（笔记读写）：用用户自己的 anon key（受 RLS 保护）
 * 用户查询操作（分享找人）：用 service_role key（跨用户查询）
 *
 * 版本号机制：
 * - 每个笔记有一个 version 字段，初始为 1
 * - 本地修改时 version + 1
 * - 保存时使用 version 进行冲突检测
 */
import { supabase, serviceClient } from './supabase';
import { getCurrentUserId, isAuthReady } from './auth';
import type { Note } from '../types';
import { canUserEditPage } from './lockService';

export async function initDatabase(): Promise<boolean> {
  try {
    const { error } = await supabase.from('notes').select('id').limit(1);
    if (error) { console.error('DB连接失败:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('DB连接异常:', e);
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

  // 辅助函数：加载完整子树（BFS）
  const collectSubtree = async (rootId: string, noteIds: Set<string>): Promise<any[]> => {
    const result: any[] = [];
    const queue: string[] = [rootId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const { data: children } = await serviceClient
        .from('notes').select('*').eq('parent_id', currentId);
      
      if (children && children.length > 0) {
        for (const child of children) {
          if (!noteIds.has(child.id)) {
            noteIds.add(child.id);
            result.push(child);
            queue.push(child.id);
          }
        }
      }
    }
    return result;
  };

  // 1. 查自己创建的所有笔记（笔记本+分区+页面）
  const { data: owned, error: ownedError } = await serviceClient
    .from('notes').select('*').eq('owner_id', userId)
    .order('order_index', { ascending: true });

  console.log('[DB] 自己创建的笔记数量:', owned?.length || 0);

  // 2. 找到用户拥有的所有笔记本，然后加载每个笔记本的完整子树
  //    重要：包括其他人（被共享者）在该笔记本下创建的笔记
  const ownedNotebooks = owned?.filter(n => n.type === 'notebook') || [];
  console.log('[DB] 拥有的笔记本数量:', ownedNotebooks.length);

  let allNotes: any[] = [...(owned || [])];
  const allNoteIds = new Set<string>(owned?.map(n => n.id) || []);

  // 对每个拥有的笔记本，加载完整子树（包含他人创建的子节点）
  for (const notebook of ownedNotebooks) {
    console.log('[DB] 加载笔记本子树:', notebook.id, notebook.title);
    const subtree = await collectSubtree(notebook.id, allNoteIds);
    console.log('[DB]   子树节点数:', subtree.length);
    allNotes.push(...subtree);
  }

  // 3. 查共享给我的笔记本（通过 note_shares）
  const { data: shares } = await serviceClient
    .from('note_shares').select('note_id').eq('user_id', userId);

  console.log('[DB] note_shares 中共享给我记录数:', shares?.length || 0);

  if (shares && shares.length > 0) {
    const sharedIds = shares.map((s: any) => s.note_id);
    console.log('[DB] 找到共享笔记本:', sharedIds);

    // 加载共享笔记本的完整子树
    for (const rootId of sharedIds) {
      if (!allNoteIds.has(rootId)) {
        // 如果共享笔记本不在自己的笔记中（说明不是owner），则加载
        const { data: node } = await serviceClient
          .from('notes').select('*').eq('id', rootId).single();
        if (node) {
          allNotes.push(node);
          allNoteIds.add(rootId);
          console.log('[DB] 加载共享笔记本节点:', node.id, node.title);
          
          const subtree = await collectSubtree(rootId, allNoteIds);
          allNotes.push(...subtree);
        }
      }
    }
  }

  if (ownedError) {
    console.error('加载笔记失败:', ownedError);
  }

  // 去重
  const seenIds = new Set<string>();
  const deduplicated = allNotes.filter(note => {
    if (seenIds.has(note.id)) return false;
    seenIds.add(note.id);
    return true;
  });

  console.log('[DB] 最终加载笔记数量:', deduplicated.length);
  deduplicated.forEach(n => console.log('[DB]   最终笔记:', n.id, n.type, n.title, 'owner:', n.owner_id));
  
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
  const rows = notes.filter(n => n.id).map(n => ({
    id: n.id, title: n.title, content: n.content || '',
    parent_id: n.parentId || null, type: n.type, owner_id: userId,
    order_index: n.order ?? 0, icon: n.icon || 'doc',
    created_at: n.createdAt, updated_at: n.updatedAt || new Date().toISOString(),
    version: n.version ?? 1, // 保存版本号
  }));
  // 用 upsert 代替 delete+insert，避免 DELETE 未完成导致 409 冲突
  const { error } = await supabase.from('notes').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error('[DB] 批量同步失败:', error.code, error.message);
    return { success: false, error: error.message };
  } else {
    console.log('[DB] 批量同步成功:', rows.length, '条');
    return { success: true };
  }
}

export async function saveNoteToCloud(note: Note): Promise<{ success: boolean; error?: string }> {
  const userId = getCurrentUserId();
  if (!userId) {
    console.warn('[DB] saveNoteToCloud: userId 为空，不保存');
    return { success: false, error: '用户未登录' };
  }

  // 获取当前用户的显示名称
  let userDisplayName = userId;
  try {
    const { data: profile } = await serviceClient
      .from('user_profiles').select('display_name').eq('id', userId).single();
    userDisplayName = profile?.display_name || userId;
  } catch (e) {
    console.warn('[DB] 获取用户信息失败，使用默认名称');
  }

  // 用 serviceClient 写入（绕过 RLS，只有原始 owner 不会被改写）
  let existingOwnerId = userId;
  let existingCreatedBy = userId;
  let existingCreatedByName = userDisplayName;
  try {
    const { data: existing } = await serviceClient
      .from('notes').select('owner_id, created_by, created_by_name').eq('id', note.id).maybeSingle();
    if (existing?.owner_id) {
      existingOwnerId = existing.owner_id;
    }
    // 保持创建者信息不变
    if (existing?.created_by) {
      existingCreatedBy = existing.created_by;
      existingCreatedByName = existing.created_by_name || existingCreatedByName;
    }
  } catch (e) {
    console.warn('[DB] 查询已有笔记失败，使用当前用户作为owner和创建者');
  }

  // 检查是否是新建笔记（通过检查是否有owner_id）
  const isNewNote = !existingOwnerId || existingOwnerId === userId;

  // 页面锁检查：只有页面才检查锁
  if (note.type === 'page') {
    const { canEdit, lockedByName } = await canUserEditPage(note.id, userId, false);
    if (!canEdit) {
      console.warn(`[DB] 保存被锁定页面拦截: id=${note.id}, lockedBy=${lockedByName}`);
      return { success: false, error: `该页面已被 ${lockedByName || '其他人'} 锁定，无法保存` };
    }
  }

  // 构建保存数据
  const saveData: Record<string, any> = {
    id: note.id, 
    title: note.title, 
    content: note.content || '',
    // mindmap_data: note.mindmapData || null, // 暂时注释，数据库列不存在
    parent_id: note.parentId || null, 
    type: note.type,
    owner_id: existingOwnerId,  // 保持原始 owner 不变
    order_index: note.order ?? 0, 
    icon: note.icon || 'doc',
    updated_at: new Date().toISOString(),
    version: note.version ?? 1,
    // 创建者信息（只在创建时设置）
    created_by: isNewNote ? userId : existingCreatedBy,
    created_by_name: isNewNote ? userDisplayName : existingCreatedByName,
    // 修改者信息
    updated_by: userId,
    updated_by_name: userDisplayName,
    // 页面锁信息
    is_locked: note.isLocked ?? false,
    locked_by: note.lockedBy ?? null,
    locked_by_name: note.lockedByName ?? null,
  };

  const { error } = await serviceClient.from('notes').upsert(saveData, { onConflict: 'id' });
  
  if (error) {
    console.error('保存笔记失败:', error.message);
    return { success: false, error: error.message };
  }
  
  // 验证数据是否真的写入数据库
  const { data: verified } = await serviceClient
    .from('notes').select('id, version').eq('id', note.id).single();
  
  if (!verified) {
    console.error('[DB] 保存后验证失败：数据库中未找到笔记 id=', note.id);
    return { success: false, error: '保存后验证失败，数据未在数据库中找到' };
  }
  
  // 验证版本号是否一致
  if (verified.version !== note.version) {
    console.warn('[DB] 保存后版本号不一致：本地版本=', note.version, '数据库版本=', verified.version);
  }
  
  console.log('[DB] 保存成功并验证 id=', note.id, '版本:', verified.version, '修改者:', userDisplayName);
  return { success: true };
}

export async function deleteNoteFromCloud(noteId: string, allDescendantIds?: Set<string>): Promise<{ success: boolean; error?: string }> {
  // 用 serviceClient 绕过 RLS，避免 owner_id 为 null 时删除被静默阻止
  const { data: existing } = await serviceClient
    .from('notes').select('id').eq('id', noteId).maybeSingle();

  if (!existing) {
    // 数据已经不存在了，算删除成功
    console.log('[DB] 删除验证：笔记 id=', noteId, '已不存在，视为删除成功');
    return { success: true };
  }

  // 如果有后代节点需要删除（传入了 allDescendantIds），先批量删除后代，再删顶层
  // 注意：即使后代节点已不存在（被其他操作删掉），批量删除也不会报错
  if (allDescendantIds && allDescendantIds.size > 0) {
    const idsToDelete = [...allDescendantIds].filter(id => id !== noteId); // 排除顶层，顶层单独删
    if (idsToDelete.length > 0) {
      const { error: batchError } = await serviceClient
        .from('notes').delete().in('id', idsToDelete);
      if (batchError) {
        console.error('[DB] 批量删除后代失败:', batchError.message);
        return { success: false, error: batchError.message };
      }
      console.log('[DB] 批量删除后代 ids=', idsToDelete);
    }
  }

  // 用 serviceClient 删除顶层（绕过 RLS）
  const { error } = await serviceClient.from('notes').delete().eq('id', noteId);

  if (error) {
    console.error('删除笔记失败:', error.message);
    return { success: false, error: error.message };
  }

  // 验证数据是否真的从数据库中删除
  const { data: verified } = await serviceClient
    .from('notes').select('id').eq('id', noteId).maybeSingle();

  if (verified) {
    console.error('[DB] 删除后验证失败：数据库中仍存在笔记 id=', noteId);
    return { success: false, error: '删除后验证失败，数据仍存在于数据库中' };
  }

  console.log('[DB] 删除成功并验证 id=', noteId);
  return { success: true };
}

// ========== 共享笔记本功能（使用 service_role 绕过 RLS） ==========
export interface ShareRecord {
  id: string; note_id: string; share_type: 'team' | 'user';
  team_id?: string; user_id?: string; permission: 'view' | 'edit';
  shared_by: string; created_at: string; user_email?: string;
}

export async function getNotebookShares(notebookId: string): Promise<ShareRecord[]> {
  const { data, error } = await serviceClient.from('note_shares').select('*').eq('note_id', notebookId);
  if (error || !data) return [];
  const userIds = data.map((s: any) => s.user_id).filter(Boolean);
  let emailMap: Record<string, string> = {};
  let nameMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await serviceClient.from('user_profiles').select('id, email, display_name').in('id', userIds);
    (profiles || []).forEach((p: any) => {
      emailMap[p.id] = p.email;
      nameMap[p.id] = p.display_name || p.email;
    });
  }
  return data.map((s: any) => ({
    ...s,
    user_email: s.user_id ? (emailMap[s.user_id] || s.user_id) : undefined,
    user_name:  s.user_id ? (nameMap[s.user_id]  || s.user_id) : undefined,
  }));
}

export async function shareNotebook(
  notebookId: string,
  email: string,
  permission: 'view' | 'edit' = 'edit'
): Promise<{ success: boolean; error?: string }> {
  const userId = getCurrentUserId();
  if (!userId) return { success: false, error: '未登录或会话已过期，请重新登录' };

  // 用 service_role 查（绕过 RLS，能看到所有用户）
  const { data: profile, error: profileError } = await serviceClient
    .from('user_profiles').select('id').eq('email', email).single();

  if (profileError || !profile) {
    return { success: false, error: `未在数据库中找到用户 ${email}，该用户可能尚未注册` };
  }

  // 写 note_shares 用用户自己的 key（有 owner 权限）
  const { error: insertError } = await supabase.from('note_shares').insert({
    note_id: notebookId,
    share_type: 'user',
    user_id: profile.id,
    permission,
    shared_by: userId,
  });

  if (insertError) return { success: false, error: insertError.message };
  return { success: true };
}

export async function unshareNotebook(
  notebookId: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  const { data: profile } = await serviceClient
    .from('user_profiles').select('id').eq('email', email).single();

  if (!profile) return { success: false, error: '未找到该用户' };

  const { error } = await supabase.from('note_shares')
    .delete()
    .eq('note_id', notebookId)
    .eq('user_id', profile.id)
    .eq('share_type', 'user');

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ========== 懒加载 API ==========

/**
 * 懒加载策略：
 * 1. 登录时只加载 type='notebook' 的记录（顶层笔记本）
 * 2. 展开笔记本时，加载该笔记本下的 type='section' 子节点
 * 3. 点击分区时，加载该分区下的 type='page' 子节点
 */

/**
 * 加载用户的笔记本列表（登录时使用）
 * 只加载顶层笔记本，不加载子节点
 */
export async function loadNotebooks(userId: string): Promise<Note[]> {
  console.log('[DB] loadNotebooks - 加载用户笔记本列表');
  
  // 1. 加载自己创建的笔记本
  const { data: ownedNotebooks, error: ownedError } = await serviceClient
    .from('notes').select('*').eq('owner_id', userId).eq('type', 'notebook')
    .order('order_index', { ascending: true });

  if (ownedError) {
    console.error('[DB] 加载笔记本失败:', ownedError);
  }

  // 2. 加载共享给我的笔记本（通过 note_shares）
  const { data: shares } = await serviceClient
    .from('note_shares').select('note_id').eq('user_id', userId);

  let sharedNotebooks: any[] = [];
  if (shares && shares.length > 0) {
    const sharedIds = shares.map((s: any) => s.note_id);
    const { data: shared } = await serviceClient
      .from('notes').select('*').eq('type', 'notebook').in('id', sharedIds);
    sharedNotebooks = shared || [];
  }

  const allNotebooks = [...(ownedNotebooks || []), ...sharedNotebooks];
  console.log('[DB] 加载到', allNotebooks.length, '个笔记本');
  
  return allNotebooks.map(normalizeNote);
}

/**
 * 按父ID加载子节点（懒加载）
 * @param parentId 父节点ID
 * @param childType 子节点类型 ('section' 或 'page')
 */
export async function loadChildNotes(parentId: string, childType: 'section' | 'page'): Promise<Note[]> {
  console.log('[DB] loadChildNotes - parentId:', parentId, 'type:', childType);
  
  const { data, error } = await serviceClient
    .from('notes').select('*')
    .eq('parent_id', parentId)
    .eq('type', childType)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('[DB] 加载子节点失败:', error);
    return [];
  }

  console.log('[DB] 加载到', data?.length || 0, '个', childType);
  return (data || []).map(normalizeNote);
}

// ========== 原有函数保持兼容 ==========
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

  try {
    // 使用 service role client 绕过 RLS
    // 用 update 而不是 upsert，避免整行替换导致 title 等字段被清空
    for (const item of items) {
      const { error: updateError } = await serviceClient
        .from('notes')
        .update({
          order_index: item.order,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (updateError) {
        console.error('[DB] 更新顺序失败:', updateError.message);
        return { success: false, error: updateError.message };
      }
    }

    console.log('[DB] 批量更新顺序成功');
    return { success: true };
  } catch (err) {
    console.error('[DB] 批量更新顺序异常:', err);
    return { success: false, error: String(err) };
  }
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

  try {
    const { data, error } = await serviceClient
      .from('user_profiles')
      .select('sidebar_state')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[DB] 加载侧边栏状态失败:', error.message);
      return null;
    }

    if (!data?.sidebar_state) {
      console.log('[DB] 侧边栏状态为空，使用默认值');
      return null;
    }

    const state = data.sidebar_state as SidebarState;
    console.log('[DB] 加载侧边栏状态成功:', state);
    return state;
  } catch (err) {
    console.error('[DB] 加载侧边栏状态异常:', err);
    return null;
  }
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

  const state: SidebarState = {
    expandedNodes,
    selectedNoteId,
    updatedAt: new Date().toISOString(),
  };

  try {
    const { error } = await serviceClient
      .from('user_profiles')
      .update({ sidebar_state: state })
      .eq('id', userId);

    if (error) {
      console.error('[DB] 保存侧边栏状态失败:', error.message);
      return { success: false, error: error.message };
    }

    console.log('[DB] 保存侧边栏状态成功:', state);
    return { success: true };
  } catch (err) {
    console.error('[DB] 保存侧边栏状态异常:', err);
    return { success: false, error: String(err) };
  }
}

// ========== 更新日志 API ==========

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
    const { data, error } = await serviceClient
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
  data: Partial<Pick<UpdateLog, 'version' | 'date' | 'items'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await serviceClient
      .from('update_logs')
      .update({
        ...data,
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
  data: Pick<UpdateLog, 'version' | 'date' | 'items'>
): Promise<{ success: boolean; data?: UpdateLog; error?: string }> {
  try {
    const { data: inserted, error } = await serviceClient
      .from('update_logs')
      .insert([data])
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
    const { error } = await serviceClient
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


