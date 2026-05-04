/**
 * 百度网盘 服务（本地后端版）
 * 处理百度网盘绑定、上传、下载等操作
 * 所有请求走本地后端 /api/baidu/*
 */

import { parseJWTPayload } from './auth';

export interface BaiduAttachment {
  id: string;
  note_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  category: string;
  baidu_path: string;
  baidu_fs_id: string;
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
 * 获取百度网盘授权 URL
 */
export async function getBaiduAuthUrl(
  appKey: string,
  secretKey: string
): Promise<{ authUrl: string; state: string }> {
  const token = getAuthToken();
  const response = await fetch('/api/baidu/auth-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      app_key: appKey,
      secret_key: secretKey,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return { authUrl: data.authUrl, state: data.state };
}

/**
 * 检查用户是否已绑定百度网盘
 */
export async function checkBaiduBinding(): Promise<{ bound: boolean; account?: any }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/baidu/check', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { bound: data.bound, account: data.account };
  } catch (error) {
    console.error('Check Baidu binding error:', error);
    return { bound: false };
  }
}

/**
 * 检查笔记本所有者是否绑定了百度网盘（共享用户无需自己绑定）
 */
export async function checkNotebookBaidu(noteId: string): Promise<{ bound: boolean; isOwner: boolean; access: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/baidu/check-notebook?note_id=${encodeURIComponent(noteId)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { bound: data.bound, isOwner: data.is_owner, access: data.access };
  } catch (error) {
    console.error('Check notebook Baidu error:', error);
    return { bound: false, isOwner: false, access: 'none' };
  }
}

/**
 * 批量检查笔记本是否绑定了百度网盘
 */
export async function checkNotebooksBaiduBatch(notebookIds: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!notebookIds.length) return result;
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/baidu/check-notebooks-batch?notebook_ids=${encodeURIComponent(notebookIds.join(','))}`, {
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
    console.error('Batch check notebooks Baidu error:', error);
  }
  return result;
}

/**
 * 解绑百度网盘
 */
export async function unbindBaidu(): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/baidu/unbind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json();
    return { success: data.success, error: data.error };
  } catch (error) {
    console.error('Unbind Baidu error:', error);
    return { success: false, error: '解绑失败' };
  }
}

/**
 * 上传文件到百度网盘
 */
export async function uploadToBaidu(
  noteId: string,
  fileName: string,
  fileContent: string
): Promise<any> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/baidu/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        note_id: noteId,
        file_name: fileName,
        file_content: fileContent,
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
      if (data.needBind) return { success: false, error: '请先绑定百度网盘账号' };
      return { success: false, error: data.error };
    }

    return { success: true, data: data.data };
  } catch (error) {
    console.error('Upload to Baidu error:', error);
    return { success: false, error: '上传失败' };
  }
}

/**
 * 从百度网盘下载文件
 */
export async function downloadFromBaidu(
  attachmentId: string
): Promise<{ success: boolean; blob?: Blob; fileName?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/baidu/download?attachment_id=${attachmentId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const data = await response.json();
      if (data.needBind) return { success: false, error: '请先绑定百度网盘账号' };
      return { success: false, error: data.error || '下载失败' };
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const fileNameMatch = disposition.match(/filename="(.+?)"/);
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'download';

    return { success: true, blob, fileName };
  } catch (error) {
    console.error('Download from Baidu error:', error);
    return { success: false, error: '下载失败' };
  }
}

/**
 * 获取百度网盘附件列表
 */
export async function getBaiduAttachments(
  noteId?: string
): Promise<{ success: boolean; data?: BaiduAttachment[]; error?: string }> {
  try {
    const token = getAuthToken();
    let url = '/api/baidu/list';
    const params: string[] = [];
    if (noteId) params.push(`note_id=${noteId}`);
    if (params.length) url += '?' + params.join('&');

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const data = await response.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true, data: data.data };
  } catch (error) {
    console.error('Get Baidu attachments error:', error);
    return { success: false, error: '获取附件列表失败' };
  }
}

/**
 * 删除百度网盘附件
 */
export async function deleteBaiduAttachment(
  attachmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/baidu/delete', {
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
    console.error('Delete Baidu attachment error:', error);
    return { success: false, error: '删除失败' };
  }
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
