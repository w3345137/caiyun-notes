/**
 * OneDrive 服务（本地后端版）
 * 处理 OneDrive 绑定、上传、下载等操作
 * 所有请求走本地后端 /api/onedrive/*
 */

import { parseJWTPayload } from './auth';

export interface OneDriveAccount {
  id: string;
  display_name?: string;
  cloud_type?: string;
}

export interface Attachment {
  id: string;
  note_id: string | null;
  user_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  onedrive_path: string;
  onedrive_file_id: string;
  folder_name: string;
  folder_path: string;
  category: string;
  created_at: string;
}

// 获取本地 JWT token
function getAuthToken(): string {
  const token = localStorage.getItem('notesapp_token');
  if (!token) return '';
  try {
    const payload = parseJWTPayload(token);
    if (payload?.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem('notesapp_token');
      return '';
    }
    return token;
  } catch {
    return '';
  }
}

/**
 * 获取 OneDrive 授权 URL
 */
export async function getOneDriveAuthUrl(
  clientId: string,
  cloudType: string = 'international',
  tenantId?: string
): Promise<{ authUrl: string; state: string; cloud: string }> {
  const token = getAuthToken();
  const response = await fetch('/api/onedrive/auth-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      client_id: clientId,
      cloud_type: cloudType,
      tenant_id: tenantId,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return { authUrl: data.authUrl, state: data.state, cloud: data.cloud };
}

/**
 * 检查用户是否已绑定 OneDrive
 */
export async function checkOneDriveBinding(): Promise<{ bound: boolean; account?: OneDriveAccount }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/onedrive/check', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { bound: data.bound, account: data.account };
  } catch (error) {
    console.error('Check OneDrive binding error:', error);
    return { bound: false };
  }
}

/**
 * 检查笔记本所有者是否绑定了 OneDrive（共享用户无需自己绑定）
 */
export async function checkNotebookOnedrive(noteId: string): Promise<{ bound: boolean; isOwner: boolean; access: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/onedrive/check-notebook?note_id=${encodeURIComponent(noteId)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { bound: data.bound, isOwner: data.is_owner, access: data.access };
  } catch (error) {
    console.error('Check notebook OneDrive error:', error);
    return { bound: false, isOwner: false, access: 'none' };
  }
}

export async function checkNotebooksStorageBatch(notebookIds: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!notebookIds.length) return result;
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/onedrive/check-notebooks-batch?notebook_ids=${encodeURIComponent(notebookIds.join(','))}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data) {
        result.set(item.notebook_id, item.bound);
      }
    }
  } catch (error) {
    console.error('Batch check notebooks storage error:', error);
  }
  return result;
}

/**
 * 解绑 OneDrive
 */
export async function unbindOneDrive(): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/onedrive/unbind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json();
    return { success: data.success, error: data.error };
  } catch (error) {
    console.error('Unbind OneDrive error:', error);
    return { success: false, error: '解绑失败' };
  }
}

/**
 * 上传文件到 OneDrive
 */
export async function uploadToOneDrive(
  file: File,
  noteId?: string | null,
  folderPath: string = '/',
  folderName: string = '根目录'
): Promise<{ success: boolean; data?: Attachment; error?: string }> {
  try {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: `文件大小超过限制（最大50MB），当前文件: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
    }
    const token = getAuthToken();
    // 将文件转换为 base64
    const base64 = await fileToBase64(file);

    const response = await fetch('/api/onedrive/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        note_id: noteId || null,
        file_name: file.name,
        file_content: base64,
        folder_path: folderPath,
        folder_name: folderName,
      }),
    });

    let data: any = {};
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const html = await response.text();
      console.error('Upload got non-JSON:', html.substring(0, 200));
      return { success: false, error: '上传失败：服务器返回非 JSON 响应' };
    }

    if (data.error) {
      if (data.needBind) return { success: false, error: '请先绑定 OneDrive 账号' };
      return { success: false, error: data.error };
    }

    return { success: true, data: data.data };
  } catch (error) {
    console.error('Upload to OneDrive error:', error);
    return { success: false, error: '上传失败' };
  }
}

/**
 * 从 OneDrive 下载文件
 */
export async function downloadFromOneDrive(
  attachmentId: string
): Promise<{ success: boolean; blob?: Blob; fileName?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/onedrive/download?attachment_id=${attachmentId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const data = await response.json();
      if (data.needBind) return { success: false, error: '请先绑定 OneDrive 账号' };
      return { success: false, error: data.error || '下载失败' };
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const fileNameMatch = disposition.match(/filename="(.+?)"/);
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'download';

    return { success: true, blob, fileName };
  } catch (error) {
    console.error('Download from OneDrive error:', error);
    return { success: false, error: '下载失败' };
  }
}

/**
 * 获取附件列表
 */
export async function getAttachments(
  noteId?: string,
  folderPath?: string
): Promise<{ success: boolean; data?: Attachment[]; error?: string }> {
  try {
    const token = getAuthToken();
    let url = '/api/onedrive/list';
    const params: string[] = [];
    if (noteId) params.push(`note_id=${noteId}`);
    if (folderPath) params.push(`folder_path=${encodeURIComponent(folderPath)}`);
    if (params.length) url += '?' + params.join('&');

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const data = await response.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true, data: data.data };
  } catch (error) {
    console.error('Get attachments error:', error);
    return { success: false, error: '获取附件列表失败' };
  }
}

/**
 * 删除附件
 */
export async function deleteAttachment(
  attachmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/onedrive/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ attachment_id: attachmentId }),
    });

    const data = await response.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true };
  } catch (error) {
    console.error('Delete attachment error:', error);
    return { success: false, error: '删除失败' };
  }
}

/**
 * 将文件转换为 base64（无前缀）
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data:xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 获取文件图标类型
 */
export function getFileIconType(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')) return 'document';
  return 'other';
}

/**
 * 获取文件图标 emoji
 */
export function getFileIcon(mimeType: string): string {
  const type = getFileIconType(mimeType);
  switch (type) {
    case 'image': return '🖼️';
    case 'video': return '🎬';
    case 'audio': return '🎵';
    case 'document': return '📄';
    default: return '📎';
  }
}
