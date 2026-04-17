/**
 * 页面锁服务
 * 通过 Edge Functions 访问数据库，替代直接使用 serviceClient
 * notes 表的 is_locked, locked_by, locked_by_name, locked_at 字段操作
 */
import { getCurrentUserId } from './auth';
import * as edgeApi from './edgeApi';

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
  const result = await edgeApi.apiLockNote(noteId, userName);

  if (!result.success) {
    console.error('加锁失败:', result.error);
    return { success: false, error: result.error || '加锁失败，请重试' };
  }

  return { success: true, locked_by: result.locked_by };
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
  const result = await edgeApi.apiUnlockNote(noteId, isOwner);

  if (!result.success) {
    console.error('解锁失败:', result.error);
    return { success: false, error: result.error || '解锁失败' };
  }

  return { success: true };
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
  const result = await edgeApi.apiRefreshLock(noteId);

  return {
    success: result.success,
    lockRefreshed: result.lockRefreshed || false,
    currentLockedBy: result.currentLockedBy || null,
  };
}

/**
 * 获取页面锁状态
 */
export async function getPageLock(noteId: string): Promise<PageLock | null> {
  const result = await edgeApi.apiGetPageLock(noteId);

  if (!result.success || !result.data) {
    return null;
  }

  return result.data as PageLock;
}

/**
 * 批量删除某用户在某笔记本下的所有锁（移除共享者时调用）
 */
export async function removeLocksForUser(
  notebookId: string,
  userId: string
): Promise<{ success: boolean; deletedCount: number }> {
  const result = await edgeApi.apiRemoveLocksForUser(notebookId);

  return {
    success: result.success,
    deletedCount: result.deletedCount || 0,
  };
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
