import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Note, generateId } from '../types';
import { loadNotesFromCloud, syncAllNotesToCloud, saveNoteToCloud, deleteNoteFromCloud, initDatabase, batchUpdateOrder, loadSidebarState, saveSidebarState } from '../lib/initDatabase';
import { getCurrentUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { unlockNote as cloudUnlockNote } from '../lib/lockService';

// ========== 实时同步相关类型 ==========
type RealtimeChannel = ReturnType<typeof supabase.channel>;
interface RealtimeState {
  channel: RealtimeChannel | null;
  reconnectAttempts: number;
  isConnected: boolean;
}

const realtimeState: RealtimeState = {
  channel: null,
  reconnectAttempts: 0,
  isConnected: false,
};

// 重连最大等待时间（毫秒）
const MAX_RECONNECT_WAIT = 30000;

// ========== 增强的冲突解决机制 ==========
// 采用"本地优先"策略：本地编辑的内容永远优先于云端

interface PendingInfo {
  version: number;      // 本地保存时的版本号
  timestamp: number;     // 本地保存时间
  localUpdatedAt: string; // 本地更新时的 updatedAt
}

const pendingUpdates: Map<string, PendingInfo> = new Map();
const PENDING_WINDOW_MS = 10000; // 10秒窗口期（延长以确保云端同步完成）

// ========== 本地编辑保护机制 ==========
// 记录正在被用户编辑的笔记ID，用户正在编辑的笔记永远不会被远程数据覆盖
const editingNoteIds: Set<string> = new Set();

// 标记笔记开始被编辑（用户正在输入）
export function markNoteAsEditing(noteId: string): void {
  editingNoteIds.add(noteId);
  console.log('[Edit] 开始编辑笔记:', noteId);
}

// 标记笔记结束编辑（用户停止输入或保存）
export function markNoteAsEditingEnd(noteId: string): void {
  editingNoteIds.delete(noteId);
  console.log('[Edit] 结束编辑笔记:', noteId);
}

// 检查笔记是否正在被本地编辑
function isNoteBeingEdited(noteId: string): boolean {
  return editingNoteIds.has(noteId);
}

// ========== 增量上传机制 ==========
// 记录每个笔记上次成功上传到云端的 content hash
// 只有 content 实际发生变化时才上传
interface UploadCache {
  contentHash: string;  // content 字段的哈希值
  uploadTime: number;    // 上次上传时间
}

const uploadCache: Map<string, UploadCache> = new Map();

// ========== 拖拽排序防抖 ==========
let reorderSectionsTimeout: ReturnType<typeof setTimeout> | null = null;
let reorderPagesTimeout: ReturnType<typeof setTimeout> | null = null;
const REORDER_DEBOUNCE_MS = 500; // 500ms 防抖

// ========== 侧边栏状态保存防抖 ==========
let sidebarStateTimeout: ReturnType<typeof setTimeout> | null = null;
const SIDEBAR_STATE_DEBOUNCE_MS = 500; // 500ms 防抖

// 侧边栏状态是否已恢复（防止重复恢复）
let sidebarStateRestored = false;

// 独立的加载锁（与 store 的 isLoading 分离，避免初始值 true 阻止首次加载）
let loadingInProgress = false;

// ========== 更新日志缓存 ==========
interface UpdateLogItem {
  id?: string;
  version: string;
  date: string;
  items: string[];
}

let updateLogsCache: UpdateLogItem[] | null = null;

export function setUpdateLogsCache(logs: UpdateLogItem[]): void {
  updateLogsCache = logs;
}

export function getUpdateLogsCache(): UpdateLogItem[] | null {
  return updateLogsCache;
}

/**
 * 防抖保存侧边栏状态到数据库
 */
function debouncedSaveSidebarState(expandedNodes: string[], selectedNoteId: string | null): void {
  if (sidebarStateTimeout) {
    clearTimeout(sidebarStateTimeout);
  }
  sidebarStateTimeout = setTimeout(async () => {
    const result = await saveSidebarState(expandedNodes, selectedNoteId);
    if (!result.success) {
      console.error('[SidebarState] 保存失败:', result.error);
    }
    sidebarStateTimeout = null;
  }, SIDEBAR_STATE_DEBOUNCE_MS);
}

/**
 * 降级查找有效的替代节点
 * 如果选中的节点被删除，尝试找到父节点或第一个可用页面
 * 注意：需要 notes 包含完整的 parentId 字段才能正确查找父节点
 */
function findValidAlternativeNoteId(notes: Note[], targetId: string | null): string | null {
  if (!targetId) return null;

  // 检查目标节点是否存在
  const target = notes.find(n => n.id === targetId);
  if (!target) {
    // 目标不存在，尝试找父节点（如果 notes 包含 parentId 字段）
    // 注意：这里需要 notes 有完整的 Note 类型数据才能工作
    const parent = target?.parentId
      ? notes.find(n => n.id === (target as Note).parentId)
      : null;
    if (parent) {
      console.log('[SidebarState] 选中节点已删除，降级选中父节点:', parent.id);
      return parent.id;
    }

    // 父节点也不存在，尝试选中第一个可用的页面
    const firstPage = notes.find(n => n.type === 'page');
    if (firstPage) {
      console.log('[SidebarState] 选中节点已删除，降级选中第一个页面:', firstPage.id);
      return firstPage.id;
    }

    // 没有任何页面，返回 null
    console.log('[SidebarState] 没有任何可用节点');
    return null;
  }

  return targetId;
}

/**
 * 验证 expandedNodes 中只有仍然存在的节点
 */
function validateExpandedNodes(notes: Note[], expandedNodes: string[]): string[] {
  const validIds = new Set(notes.map(n => n.id));
  const validExpanded = expandedNodes.filter(id => validIds.has(id));
  if (validExpanded.length !== expandedNodes.length) {
    console.log('[SidebarState] 过滤已删除节点:', expandedNodes.length, '->', validExpanded.length);
  }
  return validExpanded;
}

// 简单的哈希函数，用于比较 content 是否变化
function hashContent(content: string): string {
  // 使用完整内容的校验和 + 长度，确保任何位置修改都能检测到
  if (!content) return 'empty';
  const checksum = Array.from(content).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `${content.length}-${checksum}`;
}

// 检查笔记的 content 是否真的发生变化
function hasContentChanged(note: Note): boolean {
  const currentHash = hashContent(note.content || '');
  const cached = uploadCache.get(note.id);

  if (!cached) {
    // 首次上传，肯定变化
    return true;
  }

  // 比较 content hash
  if (cached.contentHash !== currentHash) {
    return true;
  }

  return false;
}

// 更新上传缓存
function updateUploadCache(noteId: string, content: string): void {
  uploadCache.set(noteId, {
    contentHash: hashContent(content || ''),
    uploadTime: Date.now(),
  });
}

// 获取需要增量上传的笔记列表
function getNotesNeedingUpload(notes: Note[]): Note[] {
  return notes.filter(note => hasContentChanged(note));
}

// 标记笔记为已上传（更新缓存）
function markNoteAsUploaded(note: Note): void {
  updateUploadCache(note.id, note.content || '');
}

// 维护当前用户可见的笔记 ID 集合（包括自己创建的 + 共享的）
let visibleNoteIds: Set<string> = new Set();

// 记录笔记的 owner_id，用于 Echo 过滤
let noteOwnerMap: Map<string, string> = new Map();

// 更新可见笔记列表
function updateVisibleNotes(notes: Note[]): void {
  visibleNoteIds = new Set(notes.map(n => n.id));
  noteOwnerMap = new Map(notes.map(n => [n.id, n.ownerId || '']));
  console.log('[Realtime] 更新可见笔记列表:', visibleNoteIds.size, '条');
}

// 检查笔记是否对当前用户可见
function isNoteVisible(noteId: string): boolean {
  return visibleNoteIds.has(noteId);
}

// 获取笔记的 owner_id
function getNoteOwner(noteId: string): string | undefined {
  return noteOwnerMap.get(noteId);
}

// 标记笔记正在被本地保存
function markNoteAsPending(noteId: string, version: number, updatedAt: string): void {
  pendingUpdates.set(noteId, {
    version,
    timestamp: Date.now(),
    localUpdatedAt: updatedAt,
  });
}

// 检查笔记是否处于本地保存的窗口期内
function isNotePending(noteId: string): boolean {
  const pending = pendingUpdates.get(noteId);
  if (!pending) return false;

  const elapsed = Date.now() - pending.timestamp;
  if (elapsed > PENDING_WINDOW_MS) {
    pendingUpdates.delete(noteId);
    return false;
  }
  return true;
}

// 获取笔记的待处理信息
function getPendingInfo(noteId: string): PendingInfo | undefined {
  return pendingUpdates.get(noteId);
}

// 清除待更新标记
function clearPendingNote(noteId: string): void {
  pendingUpdates.delete(noteId);
}

// 判断远程数据是否真的"新"
// 核心逻辑：永远以最新数据为准
function isRemoteNewer(
  localNote: Note | undefined,
  remoteNote: Note,
  pendingInfo?: PendingInfo
): boolean {
  if (!localNote) return true; // 本地没有，肯定是新的

  // 如果本地笔记正在被保存（窗口期内），需要特殊处理
  if (pendingInfo) {
    // 情况1：远程版本号更高 -> 远程更新
    if (remoteNote.version > pendingInfo.version) {
      return true;
    }
    // 情况2：版本号相同但 remote.updatedAt 更新 -> 远程更新
    if (remoteNote.version === pendingInfo.version) {
      const remoteTime = new Date(remoteNote.updatedAt).getTime();
      const localTime = new Date(pendingInfo.localUpdatedAt).getTime();
      return remoteTime > localTime;
    }
    // 情况3：版本号更低 -> 本地更新中，忽略远程
    return false;
  }

  // 没有 pending 信息，直接比较
  // 优先比较版本号
  if (remoteNote.version > localNote.version) {
    return true;
  }
  // 版本号相同时比较时间戳
  if (remoteNote.version === localNote.version) {
    const remoteTime = new Date(remoteNote.updatedAt).getTime();
    const localTime = new Date(localNote.updatedAt).getTime();
    return remoteTime > localTime;
  }
  return false;
}

// ========== 版本冲突对话框 ==========
function showConflictDialog(noteId: string, remoteNote: Note, localNote: Note): void {
  const remoteUserName = remoteNote.updatedByName || '其他用户';
  const pageTitle = localNote.title || '未命名页面';

  // 创建弹窗容器
  const overlay = document.createElement('div');
  overlay.id = 'conflict-dialog-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'background:white;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
  dialog.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style="font-size:16px;font-weight:600;color:#1f2937;">内容冲突</span>
    </div>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin-bottom:20px;">
      <strong>${remoteUserName}</strong> 同时修改了页面「${pageTitle}」，你的保存与对方的内容冲突。
    </p>
    <div style="display:flex;gap:8px;">
      <button id="conflict-use-remote" style="flex:1;padding:10px 16px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer;font-size:14px;color:#374151;font-weight:500;transition:all 0.15s;">
        使用对方版本
      </button>
      <button id="conflict-use-local" style="flex:1;padding:10px 16px;border:none;border-radius:8px;background:#3b82f6;cursor:pointer;font-size:14px;color:white;font-weight:500;transition:all 0.15s;">
        保留我的版本
      </button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 使用对方版本：用远程数据覆盖本地
  dialog.querySelector('#conflict-use-remote')!.addEventListener('click', () => {
    useNoteStore.getState().updateNoteFromRemote(remoteNote);
    overlay.remove();
    toast.success('已使用对方版本');
  });

  // 保留我的版本：强制覆盖服务端（不传 expectedVersion）
  dialog.querySelector('#conflict-use-local')!.addEventListener('click', async () => {
    // 重新递增版本号，强制覆盖
    const currentNote = useNoteStore.getState().getNoteById(noteId);
    if (currentNote) {
      const forceResult = await saveNoteToCloud(currentNote);
      if (forceResult.success) {
        toast.success('已保留你的版本');
      } else {
        toast.error('保存失败，请重试');
      }
    }
    overlay.remove();
  });

  // 点击遮罩不关闭（防止误操作）
}

// 规范化接收到的远程数据（保留 owner_id 等关键字段）
function normalizeIncomingNote(row: any): Note {
  return {
    id: row.id,
    title: row.title || '无标题',
    content: row.content || '',
    mindmapData: row.mindmap_data ?? row.mindmapData ?? null, // 思维导图数据
    parentId: row.parent_id || null,
    type: row.type || 'page',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    order: row.order_index ?? 0,
    icon: row.icon || 'doc',
    lockedBy: row.locked_by || null,
    lockedByName: row.locked_by_name || null,
    isLocked: row.is_locked || false,
    version: row.version ?? 1, // 版本号，默认为1
    ownerId: row.owner_id || '', // 笔记所有者 ID
    createdBy: row.created_by || '', // 创建者用户ID
    createdByName: row.created_by_name || '', // 创建者名称
    updatedBy: row.updated_by || '', // 最后修改者用户ID
    updatedByName: row.updated_by_name || '', // 最后修改者名称
    rootNotebookId: row.root_notebook_id || null, // 所属顶级笔记本ID
  };
}

// 设置实时同步
async function setupRealtime(userId: string): Promise<void> {
  // 清理旧通道
  if (realtimeState.channel) {
    console.log('[Realtime] 清理旧的实时通道...');
    supabase.removeChannel(realtimeState.channel);
    realtimeState.channel = null;
    realtimeState.isConnected = false;
  }
  if ((realtimeState as any).sharesChannel) {
    supabase.removeChannel((realtimeState as any).sharesChannel);
    (realtimeState as any).sharesChannel = null;
  }

  const maxRetries = 5;

  // 用当前 store 中的笔记初始化 visibleNoteIds（loadFromCloud 已经加载了数据）
  const storeNotes = useNoteStore.getState().notes;
  if (storeNotes.length > 0) {
    updateVisibleNotes(storeNotes);
    console.log('[Realtime] 从 store 初始化 visibleNoteIds，笔记数:', storeNotes.length);
  }

  // 创建实时通道 - 监听所有 notes 表变化
  // 然后在客户端过滤，只处理当前用户可见的笔记
  const channel = supabase
    .channel('db-changes')
    .on(
      'postgres_changes',
      {
        event: '*', // 监听所有事件 (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'notes',
        // 不设过滤器，在回调中检查笔记是否对当前用户可见
      },
      (payload) => {
        const noteId = payload.new?.id || payload.old?.id;
        console.log('[Realtime] 检测到数据库变化:', payload.eventType, noteId);

        // RLS 已在服务端保证只推送有权限的事件
        // 如果笔记不在 visibleNoteIds 中，直接加入（新共享的笔记本内容）
        if (noteId && !isNoteVisible(noteId)) {
          console.log('[Realtime] 新增可见笔记（RLS 已验证权限）:', noteId);
          visibleNoteIds.add(noteId);
          noteOwnerMap.set(noteId, payload.new?.owner_id || '');
        }

        // 增强的 Echo 过滤：
        // 使用 updated_by 字段来判断是否是当前用户的操作，而不是 owner_id
        const currentUserId = getCurrentUserId();
        const noteUpdatedBy = payload.new?.updated_by;

        // 关键：检查笔记是否正在被本地编辑，如果是则跳过远程更新
        if (isNoteBeingEdited(noteId)) {
          console.log('[Realtime] 跳过更新（笔记正在被本地编辑）:', noteId);
          return;
        }

        // 如果是当前用户刚刚修改的（5秒内），检查是否是本地正在保存的
        if (noteUpdatedBy === currentUserId) {
          const pending = getPendingInfo(noteId);

          if (pending) {
            // 本地正在保存这个笔记，检查远程版本是否真的更新
            const remoteNote = normalizeIncomingNote(payload.new);
            const localNote = useNoteStore.getState().getNoteById(noteId);

            if (!isRemoteNewer(localNote, remoteNote, pending)) {
              console.log('[Realtime] 跳过自己的更新事件（本地版本更新中）:', noteId);
              return;
            }
          } else {
            // 没有 pending 信息，但 updated_by 是当前用户，说明是之前的保存触发的推送
            // 检查本地版本是否已经是最新
            const localNote = useNoteStore.getState().getNoteById(noteId);
            const remoteNote = normalizeIncomingNote(payload.new);

            if (localNote && localNote.version >= remoteNote.version) {
              console.log('[Realtime] 跳过自己的更新事件（本地已是最新版本）:', noteId,
                '本地版本:', localNote.version, '远程版本:', remoteNote.version);
              return;
            }
          }
        }

        // 更新本地状态
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const note = normalizeIncomingNote(payload.new);
          // 确保可见列表中有这个笔记
          if (!visibleNoteIds.has(note.id)) {
            visibleNoteIds.add(note.id);
            noteOwnerMap.set(note.id, payload.new.owner_id || '');
          }
          useNoteStore.getState().updateNoteFromRemote(note);
          console.log('[Realtime] 已更新笔记（远程数据）:', note.id, note.title);
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) {
            visibleNoteIds.delete(payload.old.id);
            noteOwnerMap.delete(payload.old.id);
            useNoteStore.getState().deleteNoteFromRemote(payload.old.id);
          }
        }
      }
    )
    .on('system', { event: '*' }, (payload) => {
      console.log('[Realtime] 系统事件:', payload);
    });

  // 监听连接状态
  channel.on('broadcast', { event: 'phx_channel_error' }, () => {
    console.error('[Realtime] 通道错误');
    realtimeState.isConnected = false;
    handleReconnect(userId);
  });

  channel.on('broadcast', { event: 'phx_channel_close' }, () => {
    console.log('[Realtime] 通道关闭');
    realtimeState.isConnected = false;
    handleReconnect(userId);
  });

  // 订阅连接状态
  channel.subscribe((status) => {
    console.log('[Realtime] 连接状态:', status);

    if (status === 'SUBSCRIBED') {
      console.log('[Realtime] ✅ 实时同步已连接');
      realtimeState.isConnected = true;
      realtimeState.reconnectAttempts = 0;
    } else if (status === 'CHANNEL_ERROR') {
      console.error('[Realtime] ❌ 通道错误');
      realtimeState.isConnected = false;
      handleReconnect(userId);
    } else if (status === 'TIMED_OUT') {
      console.warn('[Realtime] ⏱️ 连接超时');
      realtimeState.isConnected = false;
      handleReconnect(userId);
    }
  });

  realtimeState.channel = channel;
  console.log('[Realtime] 实时通道已创建，等待连接...');

  // 监听 note_shares 表变化，动态刷新 visibleNoteIds
  const sharesChannel = supabase
    .channel('shares-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'note_shares',
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        console.log('[Realtime] 共享关系变化:', payload.eventType, payload.new || payload.old);

        // 共享关系变化（新增/删除），重新加载完整笔记列表
        try {
          const allNotes = await loadNotesFromCloud();
          updateVisibleNotes(allNotes);
          useNoteStore.setState({ notes: allNotes });
          console.log('[Realtime] 共享关系变化后重新加载完成，笔记数:', allNotes.length);
        } catch (err) {
          console.error('[Realtime] 共享关系变化后重新加载失败:', err);
        }
      }
    );

  sharesChannel.subscribe((status) => {
    console.log('[Realtime] note_shares 通道状态:', status);
  });

  // 保存 sharesChannel 引用，方便清理
  (realtimeState as any).sharesChannel = sharesChannel;
}

// 处理重连
async function handleReconnect(userId: string): Promise<void> {
  if (realtimeState.reconnectAttempts >= 5) {
    console.error('[Realtime] 重连次数已达上限（5次），停止重连');
    return;
  }

  realtimeState.reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, realtimeState.reconnectAttempts - 1), MAX_RECONNECT_WAIT);
  console.log(`[Realtime] ${delay / 1000}秒后进行第${realtimeState.reconnectAttempts}次重连...`);

  await new Promise((resolve) => setTimeout(resolve, delay));

  if (realtimeState.reconnectAttempts < 5) {
    await setupRealtime(userId);
  }
}

const createInitialNotes = (): Note[] => [
  {
    id: 'notebook-1',
    title: '我的笔记本',
    content: '',
    parentId: null,
    type: 'notebook',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    icon: 'doc',
    version: 1,
  },
  {
    id: 'section-1',
    title: '学习笔记',
    content: '',
    parentId: 'notebook-1',
    type: 'section',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    icon: 'doc',
    version: 1,
  },
  {
    id: 'page-1',
    title: 'React入门指南',
    content: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'React入门指南' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '欢迎学习React！这是一个现代的JavaScript框架。' },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '核心概念' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '组件 (Components)' }] },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Props 和 State' }] },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: '生命周期 (Lifecycle)' }] },
              ],
            },
          ],
        },
      ],
    }),
    parentId: 'section-1',
    type: 'page',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    icon: 'doc',
    version: 1,
  },
  {
    id: 'page-2',
    title: 'TypeScript笔记',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'TypeScript学习笔记' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'TypeScript是JavaScript的超集，提供了类型系统。' }] },
      ],
    }),
    parentId: 'section-1',
    type: 'page',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 1,
    icon: 'doc',
    version: 1,
  },
  {
    id: 'section-2',
    title: '工作记录',
    content: '',
    parentId: 'notebook-1',
    type: 'section',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 1,
    icon: 'doc',
    version: 1,
  },
  {
    id: 'page-3',
    title: '项目计划',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '项目计划' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '这是一个示例项目计划页面。' }] },
      ],
    }),
    parentId: 'section-2',
    type: 'page',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    icon: 'doc',
    version: 1,
  },
  {
    id: 'page-4',
    title: '会议纪要',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '会议纪要' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '记录重要会议内容...' }] },
      ],
    }),
    parentId: 'section-2',
    type: 'page',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 1,
    icon: 'doc',
    version: 1,
  },
];

interface NoteState {
  notes: Note[];
  selectedNoteId: string | null;
  expandedNodes: string[];
  isLoading: boolean;
  loadingStatus: string; // 加载进度文字
  loadingProgress: number; // 加载进度 0-100
  isSyncing: boolean;
  lastSyncedAt: string | null;
  dbReady: boolean; // 数据库是否就绪
  dbError: string | null; // 数据库错误信息
  syncError: string | null; // 同步/保存错误信息（如页面锁定）
  realtimeConnected: boolean; // 实时同步是否连接
  addNote: (parentId: string | null, type: Note['type'], title?: string, options?: { skipSelect?: boolean; silent?: boolean }) => string;
  updateNote: (id: string, updates: Partial<Note>, options?: { silent?: boolean }) => void;
  updateNoteFromRemote: (note: Note) => void; // 从远程更新笔记
  deleteNote: (id: string) => void;
  deleteNoteFromRemote: (id: string) => void; // 从远程删除笔记
  selectNote: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  getNoteById: (id: string) => Note | undefined;
  getChildNotes: (parentId: string | null) => Note[];
  getRootNotes: () => Note[];
  loadFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<{ success: boolean; error?: string }>;
  setSyncing: (syncing: boolean) => void;
  setSyncError: (error: string | null) => void;
  setDbReady: (ready: boolean, error?: string) => void;
  lockNote: (id: string, userId: string, userName: string) => void;
  unlockNote: (id: string) => void;
  isNoteLockedByOther: (id: string, userId: string) => boolean;
  clearLocalCache: () => void; // 清除本地缓存（退出登录时调用）
  // 拖拽排序方法
  reorderSections: (notebookId: string, orderedIds: string[]) => void; // 重排分区顺序
  reorderPages: (sectionId: string, orderedIds: string[]) => void; // 重排页面顺序
  // 侧边栏状态恢复方法
  restoreSidebarState: () => Promise<void>; // 从数据库恢复侧边栏状态
}

// 获取初始选中的笔记ID
const getInitialSelectedNoteId = (): string | null => {
  return 'page-1';
};

export const useNoteStore = create<NoteState>()(
  persist(
    (set, get) => ({
      notes: [],
      selectedNoteId: null,
      expandedNodes: [],
      isLoading: true,
      loadingStatus: '正在连接服务器...',
      loadingProgress: 0,
      isSyncing: false,
      lastSyncedAt: null,
      dbReady: false,
      dbError: null,
      syncError: null,
      realtimeConnected: false,

      // 拖拽排序：重排分区顺序
      reorderSections: (notebookId: string, orderedIds: string[]) => {
        console.log('[Reorder] 重排分区顺序:', notebookId, orderedIds);

        // 1. 先立即更新前端状态
        set((state) => ({
          notes: state.notes.map(note => {
            if (note.parentId === notebookId && note.type === 'section') {
              const newOrder = orderedIds.indexOf(note.id);
              if (newOrder !== -1) {
                return { ...note, order: newOrder };
              }
            }
            return note;
          }),
        }));

        // 2. 防抖更新数据库
        if (reorderSectionsTimeout) {
          clearTimeout(reorderSectionsTimeout);
        }

        reorderSectionsTimeout = setTimeout(async () => {
          const updates = orderedIds.map((id, index) => ({ id, order: index }));
          const result = await batchUpdateOrder(updates);
          if (!result.success) {
            console.error('[Reorder] 保存分区顺序失败:', result.error);
            toast.error('排序保存失败，请重试');
          }
          reorderSectionsTimeout = null;
        }, REORDER_DEBOUNCE_MS);
      },

      // 拖拽排序：重排页面顺序
      reorderPages: (sectionId: string, orderedIds: string[]) => {
        console.log('[Reorder] 重排页面顺序:', sectionId, orderedIds);

        // 1. 先立即更新前端状态
        set((state) => ({
          notes: state.notes.map(note => {
            if (note.parentId === sectionId && note.type === 'page') {
              const newOrder = orderedIds.indexOf(note.id);
              if (newOrder !== -1) {
                return { ...note, order: newOrder };
              }
            }
            return note;
          }),
        }));

        // 2. 防抖更新数据库
        if (reorderPagesTimeout) {
          clearTimeout(reorderPagesTimeout);
        }

        reorderPagesTimeout = setTimeout(async () => {
          const updates = orderedIds.map((id, index) => ({ id, order: index }));
          const result = await batchUpdateOrder(updates);
          if (!result.success) {
            console.error('[Reorder] 保存页面顺序失败:', result.error);
            toast.error('排序保存失败，请重试');
          }
          reorderPagesTimeout = null;
        }, REORDER_DEBOUNCE_MS);
      },

      loadFromCloud: async () => {
        // 防止并发加载（用独立标志，不依赖 store 的 isLoading）
        if (loadingInProgress) {
          console.log('[Load] 正在加载中，跳过重复调用');
          return;
        }
        loadingInProgress = true;
        set({ isLoading: true, dbError: null, loadingStatus: '正在连接服务器...', loadingProgress: 5 });

        try {
          const userId = getCurrentUserId();
          if (!userId) {
            loadingInProgress = false;
            set({ isLoading: false, dbError: '用户未登录', loadingStatus: '未登录', loadingProgress: 0 });
            return;
          }

          console.log('[Load] 开始加载，用户ID:', userId);
          set({ loadingStatus: '正在加载数据...', loadingProgress: 15 });

          // 并行执行：数据库连接检查 + 笔记加载 + 侧边栏状态
          // initDatabase 只检查 auth session，和 Edge Function 无依赖关系
          const [dbConnected, allNotes, savedState] = await Promise.all([
            initDatabase(),
            loadNotesFromCloud(),
            loadSidebarState(),
          ]);

          console.log('[Load] 并行加载完成 - DB:', dbConnected, '笔记数:', allNotes.length, '侧边栏:', !!savedState);

          if (!dbConnected) {
            loadingInProgress = false;
            set({
              isLoading: false,
              dbReady: false,
              dbError: '无法连接到数据库，请检查网络后重试',
              loadingStatus: '数据库连接失败',
              loadingProgress: 0,
            });
            console.error('[Load] 数据库连接失败');
            return;
          }

          set({ dbReady: true, loadingStatus: `已加载 ${allNotes.length} 条笔记，正在处理...`, loadingProgress: 70 });

          if (allNotes.length > 0) {
            // 去重
            set({ loadingStatus: '正在处理笔记数据...', loadingProgress: 75 });
            const seen = new Set<string>();
            const uniqueNotes = allNotes.filter(n => {
              if (seen.has(n.id)) return false;
              seen.add(n.id);
              return true;
            });
            console.log('[Load] 去重后笔记数:', uniqueNotes.length);

            set({ loadingStatus: '正在恢复侧边栏状态...', loadingProgress: 85 });

            // 恢复侧边栏状态
            if (savedState && savedState.expandedNodes.length > 0) {
              const validExpanded = validateExpandedNodes(uniqueNotes, savedState.expandedNodes);
              const validSelected = findValidAlternativeNoteId(uniqueNotes, savedState.selectedNoteId);

              set({
                notes: uniqueNotes,
                expandedNodes: validExpanded,
                selectedNoteId: validSelected,
                lastSyncedAt: new Date().toISOString(),
                loadingStatus: `正在选中笔记...`,
                loadingProgress: 90,
              });
              console.log('[Load] 侧边栏状态已恢复，展开节点:', validExpanded.length, '选中:', validSelected);
            } else {
              set({
                notes: uniqueNotes,
                lastSyncedAt: new Date().toISOString(),
                loadingStatus: '侧边栏状态为空，使用默认',
                loadingProgress: 90,
              });
              console.log('[Load] 无保存的侧边栏状态，使用默认');
            }
          } else {
            set({ lastSyncedAt: new Date().toISOString(), loadingStatus: '云端无笔记数据', loadingProgress: 95 });
            console.log('[Load] 云端没有笔记数据');
          }

          set({ loadingStatus: '正在初始化实时同步...', loadingProgress: 95 });

          // 加载成功后设置实时同步
          console.log('[Load] 开始设置实时同步...');
          await setupRealtime(userId!);
          console.log('[Load] 实时同步设置完成');

          loadingInProgress = false;
          set({ isLoading: false, loadingStatus: '加载完成', loadingProgress: 100 });
          console.log('[Load] 加载流程全部完成');
        } catch (err) {
          console.error('[Load] 加载云端笔记失败:', err);
          loadingInProgress = false;
          set({ isLoading: false, dbError: `加载数据失败: ${String(err)}`, loadingStatus: '加载失败', loadingProgress: 0 });
        }
      },

      syncToCloud: async (): Promise<{ success: boolean; error?: string }> => {
        if (!get().dbReady) {
          console.error('数据库未就绪，无法同步');
          return { success: false, error: '数据库未就绪' };
        }

        set({ isSyncing: true, syncError: null });
        try {
          const allNotes = get().notes;

          // 增量上传：只上传 content 有变化的笔记
          const notesToUpload = getNotesNeedingUpload(allNotes);

          if (notesToUpload.length === 0) {
            console.log('[增量同步] 没有需要上传的笔记，所有内容已是最新');
            set({ isSyncing: false, lastSyncedAt: new Date().toISOString() });
            return { success: true };
          }

          console.log(`[增量同步] 开始上传 ${notesToUpload.length}/${allNotes.length} 条笔记`);

          // 使用单个笔记上传，确保每次上传后更新缓存
          for (const note of notesToUpload) {
            // 跳过被锁定的页面（页面锁定错误不报错，只跳过）
            const isLocked = note.type === 'page' && get().isNoteLockedByOther(note.id, getCurrentUserId());
            if (isLocked) {
              console.log(`[增量同步] 跳过被锁定的页面: ${note.id}`);
              continue;
            }

            const result = await saveNoteToCloud(note);
            if (!result.success) {
              // 如果是页面锁定错误，跳过并继续同步其他笔记
              if (result.error && result.error.includes('已被') && result.error.includes('锁定')) {
                console.warn(`[增量同步] 页面被锁定，跳过: ${note.id}`);
                continue;
              }
              console.error(`[增量同步] 笔记 ${note.id} 保存失败:`, result.error);
              // 其他错误（非锁定）放到 syncError，显示时包含页面标题
              const pageTitle = note.title || '未命名页面';
              set({ isSyncing: false, syncError: `「${pageTitle}」保存失败：${result.error || '未知错误'}` });
              return { success: false, error: result.error };
            }
            // 上传成功后更新缓存
            markNoteAsUploaded(note);
          }

          set({ isSyncing: false, lastSyncedAt: new Date().toISOString() });
          console.log('[增量同步] 同步完成');
          return { success: true };

          // 注意：不再使用保底机制拉取数据
          // 因为已经有实时同步（Realtime）机制处理远程更新
          // 保底机制会覆盖用户正在编辑的本地内容
        } catch (err) {
          console.error('同步到云端失败:', err);
          set({ isSyncing: false, syncError: `同步失败：${String(err)}` });
          return { success: false, error: String(err) };
        }
      },

      // 从远程更新笔记（用于实时同步）
      // 核心逻辑：
      // 规则3：仅在页面加载、手动刷新、Realtime协作时更新
      // 规则4：版本比较 - 服务器版本 > 本地版本时更新
      updateNoteFromRemote: (note: Note) => {
        // 关键检查：如果笔记正在被本地编辑，直接跳过，不接收远程更新
        if (isNoteBeingEdited(note.id)) {
          console.log('[Remote] 跳过更新（笔记正在被本地编辑）:', note.id);
          return;
        }

        const existingNote = get().notes.find((n) => n.id === note.id);
        const pending = getPendingInfo(note.id);

        // 如果笔记正处于本地保存状态（pending窗口期内），检查远程是否真的更新
        if (isNotePending(note.id)) {
          if (!isRemoteNewer(existingNote, note, pending)) {
            console.log('[Remote] 跳过更新（笔记正在被本地保存，且远程不是更新）:', note.id);
            return;
          }
        }

        if (existingNote) {
          // 规则4：版本比较 - 服务器版本 > 本地版本时更新
          const localVersion = existingNote.version || 0;
          const remoteVersion = note.version || 1;
          
          // 如果远程版本确实更新了
          if (remoteVersion > localVersion) {
            console.log('[Remote] 检测到远程版本更新:', note.id, 
              '本地版本:', localVersion, '->', '远程版本:', remoteVersion);
            
            // 合并远程数据，保留本地的 mindmapData（如果远程没有的话）
            const mergedNote = { ...existingNote, ...note };
            if (!note.mindmapData && existingNote.mindmapData) {
              mergedNote.mindmapData = existingNote.mindmapData;
            }
            
            set((state) => ({
              notes: state.notes.map((n) =>
                n.id === note.id ? mergedNote : n
              ),
            }));

            // 如果是协作者修改（非当前用户），显示非阻塞提示
            const currentUserId = getCurrentUserId();
            if (note.updatedBy && note.updatedBy !== currentUserId) {
              const updaterName = note.updatedByName || '其他用户';
              const pageTitle = note.title || '未命名页面';
              toast(`${updaterName} 更新了「${pageTitle}」`, {
                icon: '📝',
                duration: 3000,
              });
            }

            console.log('[Remote] 已更新笔记（远程数据）:', note.id, note.title, '版本:', note.version);
          } else {
            console.log('[Remote] 跳过更新（本地数据已是最新或版本相同）:', note.id,
              '本地版本:', existingNote.version, '远程版本:', note.version);
          }
        } else {
          // 添加新笔记
          set((state) => ({
            notes: [...state.notes, note],
          }));
          console.log('[Remote] 已添加笔记:', note.id, note.title);
        }
      },

      // 从远程删除笔记（用于实时同步）
      deleteNoteFromRemote: (id: string) => {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
          selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
        }));
        console.log('[Remote] 已删除笔记:', id);
      },

      setSyncing: (syncing: boolean) => {
        set({ isSyncing: syncing });
      },

      setSyncError: (error: string | null) => {
        set({ syncError: error });
      },

      setDbReady: (ready: boolean, error?: string) => {
        set({ dbReady: ready, dbError: error || null });
      },

      lockNote: (id: string, userId: string, userName: string) => {
        const existingNote = get().getNoteById(id);
        const newVersion = (existingNote?.version ?? 0) + 1;
        const now = new Date().toISOString();

        // 标记为 pending
        markNoteAsPending(id, newVersion, now);

        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id ? {
              ...note,
              isLocked: true,
              lockedBy: userId,
              lockedByName: userName,
              lockedAt: new Date().toISOString(),
              updatedAt: now,
              version: newVersion,
            } : note
          ),
        }));

        // 异步保存到云端
        const note = get().getNoteById(id);
        if (note) {
          saveNoteToCloud(note).then(result => {
            clearPendingNote(id);
            if (!result.success) {
              console.error('[lockNote] 保存失败:', result.error);
            }
          }).catch(err => {
            console.error('[lockNote] 保存异常:', err);
            clearPendingNote(id);
          });
        }
      },

      unlockNote: (id: string) => {
        const existingNote = get().getNoteById(id);
        if (!existingNote) return;

        const currentUserId = getCurrentUserId();
        if (!currentUserId) return;

        const newVersion = (existingNote.version ?? 0) + 1;
        const now = new Date().toISOString();

        // 检查是否是笔记本所有者（只有所有者和加锁者可以解锁）
        const isOwner = existingNote.ownerId === currentUserId;

        // 标记为 pending
        markNoteAsPending(id, newVersion, now);

        // 先更新本地状态
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id ? {
              ...note,
              isLocked: false,
              lockedBy: null,
              lockedByName: null,
              lockedAt: null,
              updatedAt: now,
              version: newVersion,
            } : note
          ),
        }));

        // 调用云端解锁（带权限检查）
        cloudUnlockNote(id, currentUserId, isOwner).then(result => {
          clearPendingNote(id);
          if (!result.success) {
            // 解锁失败，回滚本地状态
            console.error('[unlockNote] 解锁失败:', result.error);
            toast.error(result.error || '解锁失败');
            // 回滚
            set((state) => ({
              notes: state.notes.map((note) =>
                note.id === id ? existingNote : note
              ),
            }));
          }
        }).catch(err => {
          console.error('[unlockNote] 解锁异常:', err);
          clearPendingNote(id);
          toast.error('解锁失败');
          // 回滚
          set((state) => ({
            notes: state.notes.map((note) =>
              note.id === id ? existingNote : note
            ),
          }));
        });
      },

      isNoteLockedByOther: (id: string, userId?: string) => {
        const note = get().getNoteById(id);
        if (!note || !note.lockedBy) return false;
        const currentUserId = userId || getCurrentUserId();
        return currentUserId ? note.lockedBy !== currentUserId : true;
      },

      addNote: (parentId, type, title, options) => {
        const skipSelect = options?.skipSelect;
        const silent = options?.silent;
        const id = generateId();
        const now = new Date().toISOString();
        const siblings = get().getChildNotes(parentId);
        const userId = getCurrentUserId();

        const icons: Record<string, string> = {
          notebook: 'doc',
          section: 'doc',
          page: 'doc',
        };

        const newNote: Note = {
          id,
          title: title || (type === 'page' ? '新页面' : type === 'section' ? '新分区' : '新笔记本'),
          content: type === 'page' ? JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) : '',
          parentId,
          type,
          createdAt: now,
          updatedAt: now,
          order: siblings.length,
          icon: icons[type],
          version: 1, // 新笔记版本号为1
          createdBy: userId || '',
          createdByName: userId || '当前用户', // 暂时使用用户ID，数据库会保存真实名称
          updatedBy: userId || '',
          updatedByName: userId || '当前用户',
          rootNotebookId: type === 'notebook' ? id : (parentId ? get().getNoteById(parentId)?.rootNotebookId || null : null),
        };

        // 标记为 pending，5秒内忽略远程推送
        markNoteAsPending(id, 1, now);

        set((state) => ({
          notes: [...state.notes, newNote],
          selectedNoteId: skipSelect ? state.selectedNoteId : id,
          expandedNodes: parentId && !state.expandedNodes.includes(parentId)
            ? [...state.expandedNodes, parentId]
            : state.expandedNodes,
        }));

        // 同步保存到云端并验证
        (async () => {
          try {
            const result = await saveNoteToCloud(newNote);
            clearPendingNote(id);
            if (result.success) {
              console.log('[addNote] 保存成功 id=', id);
              if (!silent) {
                toast.success(`已创建${type === 'page' ? '页面' : type === 'section' ? '分区' : '笔记本'}`);
              }
            } else {
              console.error('[addNote] 保存失败:', result.error);
              toast.error(`创建${type === 'page' ? '页面' : type === 'section' ? '分区' : '笔记本'}失败：${result.error}`);
            }
          } catch (err) {
            console.error('[addNote] 保存异常:', err);
            clearPendingNote(id);
            toast.error(`创建${type === 'page' ? '页面' : type === 'section' ? '分区' : '笔记本'}失败：网络异常`);
          }
        })();

        return id;
      },

      updateNote: (id, updates, options?: { silent?: boolean }) => {
        const existingNote = get().getNoteById(id);
        const oldVersion = existingNote?.version ?? 0;
        const newVersion = oldVersion + 1;
        const now = new Date().toISOString();
        const userId = getCurrentUserId();

        // 标记为 pending，5秒内忽略远程推送
        markNoteAsPending(id, newVersion, now);

        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id
              ? { ...note, ...updates, updatedAt: now, version: newVersion, updatedBy: userId || '', updatedByName: userId || '当前用户' }
              : note
          ),
        }));

        // 同步保存到云端并验证
        const note = get().getNoteById(id);
        if (note) {
          (async () => {
            try {
              // 传递 expectedVersion（保存前的版本号），用于服务端乐观锁校验
              const result = await saveNoteToCloud(note, oldVersion);
              clearPendingNote(id);
              if (result.success) {
                console.log('[updateNote] 保存成功 id=', id);
                // silent 模式不弹 toast（自动保存场景）
                if (!options?.silent) {
                  toast.success('已保存到云端');
                }
              } else if (result.error === 'VERSION_CONFLICT' && result.conflictInfo) {
                // 版本冲突：提示用户
                console.warn('[updateNote] 版本冲突，提示用户选择');
                const serverVer = result.conflictInfo.serverVersion;
                const clientVer = result.conflictInfo.clientVersion;
                // 从远程拉取最新版本的数据
                const { data: serverNote } = await supabase
                  .from('notes')
                  .select('*')
                  .eq('id', id)
                  .single();
                if (serverNote) {
                  const remoteNote = normalizeIncomingNote(serverNote);
                  // 弹出冲突选择提示
                  showConflictDialog(id, remoteNote, note);
                } else {
                  toast.error('保存冲突：无法获取最新版本，请刷新页面');
                }
              } else {
                console.error('[updateNote] 保存失败:', result.error);
                toast.error(`保存失败：${result.error}`);
              }
            } catch (err) {
              console.error('[updateNote] 保存异常:', err);
              clearPendingNote(id);
              toast.error('保存失败：网络异常');
            }
          })();
        }
      },

      deleteNote: (id) => {
        const note = get().getNoteById(id);
        if (!note) return;

        const noteType = note.type;
        const noteTitle = note.title;
        const idsToDelete = new Set<string>();
        const collectIds = (noteId: string) => {
          idsToDelete.add(noteId);
          get().getChildNotes(noteId).forEach((child) => collectIds(child.id));
        };
        collectIds(id);

        set((state) => ({
          notes: state.notes.filter((n) => !idsToDelete.has(n.id)),
          selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
        }));

        // 同步从云端删除并验证（传入所有后代 IDs，确保级联删除）
        (async () => {
          try {
            const result = await deleteNoteFromCloud(id, idsToDelete);
            if (result.success) {
              console.log('[deleteNote] 删除成功 id=', id, '级联删除:', idsToDelete.size, '个节点');
              toast.success(`已删除${noteType === 'page' ? '页面' : noteType === 'section' ? '分区' : '笔记本'}`);
            } else {
              console.error('[deleteNote] 删除失败:', result.error);
              toast.error(`删除${noteType === 'page' ? '页面' : noteType === 'section' ? '分区' : '笔记本'}失败：${result.error}`);
            }
          } catch (err) {
            console.error('[deleteNote] 删除异常:', err);
            toast.error(`删除${noteType === 'page' ? '页面' : noteType === 'section' ? '分区' : '笔记本'}失败：网络异常`);
          }
        })();
      },

      selectNote: (id) => {
        set({ selectedNoteId: id });
        // 防抖保存侧边栏状态
        const { expandedNodes, selectedNoteId } = get();
        debouncedSaveSidebarState(expandedNodes, id);
      },

      toggleExpanded: (id) => {
        const newExpandedNodes = (() => {
          const { expandedNodes } = get();
          return expandedNodes.includes(id)
            ? expandedNodes.filter((n) => n !== id)
            : [...expandedNodes, id];
        })();

        set({ expandedNodes: newExpandedNodes });
        // 防抖保存侧边栏状态
        const { selectedNoteId } = get();
        debouncedSaveSidebarState(newExpandedNodes, selectedNoteId);
      },

      getNoteById: (id) => get().notes.find((note) => note.id === id),

      getChildNotes: (parentId) =>
        get().notes.filter((note) => note.parentId === parentId).sort((a, b) => a.order - b.order),

      getRootNotes: () => get().getChildNotes(null),

      // 清除本地缓存（退出登录时调用）
      clearLocalCache: () => {
        // 清除所有全局变量
        pendingUpdates.clear();
        editingNoteIds.clear();
        uploadCache.clear();
        visibleNoteIds.clear();
        noteOwnerMap.clear();
        // 清除zustand持久化存储
        localStorage.removeItem('cloud-note-storage');
        // 重置状态
        set({
          notes: [],
          selectedNoteId: null,
          expandedNodes: [],
          isLoading: false,
          isSyncing: false,
          lastSyncedAt: null,
          dbReady: false,
        });
        // 重置侧边栏恢复标志
        sidebarStateRestored = false;
        loadingInProgress = false;
        console.log('[Store] 本地缓存已清除');
      },

      // 从数据库恢复侧边栏状态
      restoreSidebarState: async () => {
        // 侧边栏状态恢复逻辑已移至 loadFromCloud
        // 此函数保留用于兼容性
        sidebarStateRestored = true;
        console.log('[SidebarState] 状态已恢复');
      },
    }),
    {
      name: 'cloud-note-storage',
      // notes 不持久化，每次从云端全量加载
      partialize: (state) => ({
        // notes: state.notes,  // 已移除 - 每次从云端全量加载，不从本地缓存恢复
        // selectedNoteId: state.selectedNoteId,  // 不再持久化，刷新后默认不选中任何笔记
        expandedNodes: state.expandedNodes,
      }),
    }
  )
);
