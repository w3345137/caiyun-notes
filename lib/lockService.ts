/**
 * 页面锁服务
 * notes 表的 is_locked, locked_by, locked_by_name, locked_at 字段操作
 */
import { supabase, serviceClient } from './supabase';

export interface PageLock {
  is_locked: boolean;
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
}

const LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24小时

/**
 * 加锁（原子操作，防止并发）
 * @returns { success: true } 或 { success: false, error: string }
 */
export async function lockNote(
  noteId: string,
  userId: string,
  userName: string
): Promise<{ success: boolean; error?: string; locked_by?: string }> {
  try {
    // 原子加锁：只有 is_locked = false 时才能加成功
    const { data, error } = await serviceClient
      .from('notes')
      .update({
        is_locked: true,
        locked_by: userId,
        locked_by_name: userName,
        locked_at: new Date().toISOString(),
      })
      .eq('id', noteId)
      .eq('is_locked', false)
      .select('id, locked_by')
      .single();

    if (error) {
      console.error('加锁失败:', error);
      return { success: false, error: '加锁失败，请重试' };
    }

    if (!data) {
      // 没有返回数据说明页面已被锁定
      return { success: false, error: '页面已被其他人锁定' };
    }

    return { success: true, locked_by: data.locked_by };
  } catch (err: any) {
    console.error('加锁异常:', err);
    return { success: false, error: err?.message || '加锁失败' };
  }
}

/**
 * 解锁
 * @param noteId 页面ID
 * @param userId 解锁者ID（加锁者或笔记本所有者）
 * @param isOwner 是否为笔记本所有者
 */
export async function unlockNote(
  noteId: string,
  userId: string,
  isOwner: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    // 所有者可以解锁任何人的锁，非所有者只能解自己的锁
    if (isOwner) {
      const { error } = await serviceClient
        .from('notes')
        .update({
          is_locked: false,
          locked_by: null,
          locked_by_name: null,
          locked_at: null,
        })
        .eq('id', noteId)
        .eq('is_locked', true); // 只更新已锁定的

      if (error) {
        console.error('解锁失败:', error);
        return { success: false, error: '解锁失败' };
      }
      return { success: true };
    } else {
      // 非所有者只能解锁自己的锁
      const { error } = await serviceClient
        .from('notes')
        .update({
          is_locked: false,
          locked_by: null,
          locked_by_name: null,
          locked_at: null,
        })
        .eq('id', noteId)
        .eq('locked_by', userId)
        .eq('is_locked', true);

      if (error) {
        console.error('解锁失败:', error);
        return { success: false, error: '解锁失败' };
      }
      return { success: true };
    }
  } catch (err: any) {
    console.error('解锁异常:', err);
    return { success: false, error: err?.message || '解锁失败' };
  }
}

/**
 * 续期锁（加锁者访问自己的锁页面时自动续期）
 * 规则：
 * - 只有加锁者本人才能续期
 * - 如果页面当前无人加锁，自动续期24h
 * - 如果页面已被他人加锁，不续期（原锁永久失效）
 */
export async function refreshLockIfNeeded(
  noteId: string,
  userId: string
): Promise<{ success: boolean; lockRefreshed: boolean; currentLockedBy: string | null }> {
  try {
    // 先查当前锁状态
    const { data: note, error: fetchError } = await serviceClient
      .from('notes')
      .select('id, is_locked, locked_by, locked_at')
      .eq('id', noteId)
      .single();

    if (fetchError || !note) {
      return { success: false, lockRefreshed: false, currentLockedBy: null };
    }

    // 如果页面没人锁定，且是加锁者回来，续期
    if (!note.is_locked && note.locked_by === userId) {
      await serviceClient
        .from('notes')
        .update({
          locked_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .eq('locked_by', userId);
      return { success: true, lockRefreshed: true, currentLockedBy: null };
    }

    // 如果页面被他人加锁，原锁永久失效
    if (note.is_locked && note.locked_by !== userId) {
      return { success: true, lockRefreshed: false, currentLockedBy: note.locked_by };
    }

    // 如果是自己加的锁还在，续期
    if (note.is_locked && note.locked_by === userId) {
      const { error: updateError } = await serviceClient
        .from('notes')
        .update({
          locked_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .eq('locked_by', userId);

      return { success: !updateError, lockRefreshed: !updateError, currentLockedBy: null };
    }

    return { success: true, lockRefreshed: false, currentLockedBy: null };
  } catch (err) {
    console.error('续期锁异常:', err);
    return { success: false, lockRefreshed: false, currentLockedBy: null };
  }
}

/**
 * 获取页面锁状态
 */
export async function getPageLock(noteId: string): Promise<PageLock | null> {
  try {
    const { data, error } = await serviceClient
      .from('notes')
      .select('is_locked, locked_by, locked_by_name, locked_at')
      .eq('id', noteId)
      .single();

    if (error || !data) return null;
    return data as PageLock;
  } catch (err) {
    console.error('获取锁状态异常:', err);
    return null;
  }
}

/**
 * 批量删除某用户在某笔记本下的所有锁（移除共享者时调用）
 */
export async function removeLocksForUser(
  notebookId: string,
  userId: string
): Promise<{ success: boolean; deletedCount: number }> {
  try {
    // 获取该笔记本下所有被该用户锁定的页面
    const { data: lockedPages, error: fetchError } = await serviceClient
      .from('notes')
      .select('id')
      .eq('parent_id', notebookId)
      .eq('locked_by', userId)
      .eq('is_locked', true);

    if (fetchError) {
      console.error('查询用户锁失败:', fetchError);
      return { success: false, deletedCount: 0 };
    }

    if (!lockedPages || lockedPages.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const pageIds = lockedPages.map((p: any) => p.id);

    // 批量解锁
    const { error: updateError } = await serviceClient
      .from('notes')
      .update({
        is_locked: false,
        locked_by: null,
        locked_by_name: null,
        locked_at: null,
      })
      .in('id', pageIds);

    if (updateError) {
      console.error('批量解锁失败:', updateError);
      return { success: false, deletedCount: 0 };
    }

    return { success: true, deletedCount: lockedPages.length };
  } catch (err) {
    console.error('批量解锁异常:', err);
    return { success: false, deletedCount: 0 };
  }
}

/**
 * 检查用户是否可以编辑页面
 * @returns { canEdit: boolean, lockedBy: string | null, lockedByName: string | null }
 */
export async function canUserEditPage(
  noteId: string,
  userId: string,
  isNotebookOwner: boolean
): Promise<{ canEdit: boolean; lockedBy: string | null; lockedByName: string | null }> {
  try {
    const lock = await getPageLock(noteId);
    if (!lock) {
      // 没有锁信息，按无锁处理
      return { canEdit: true, lockedBy: null, lockedByName: null };
    }

    if (!lock.is_locked) {
      // 页面未锁定，可以编辑
      return { canEdit: true, lockedBy: null, lockedByName: null };
    }

    // 页面已锁定
    if (lock.locked_by === userId) {
      // 加锁者本人可以编辑
      return { canEdit: true, lockedBy: null, lockedByName: null };
    }

    // 非加锁者只能看（所有者也只能看，不能编辑）
    return {
      canEdit: false,
      lockedBy: lock.locked_by,
      lockedByName: lock.locked_by_name,
    };
  } catch (err) {
    console.error('检查编辑权限异常:', err);
    return { canEdit: false, lockedBy: null, lockedByName: null };
  }
}
