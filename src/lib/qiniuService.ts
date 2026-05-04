/**
 * 七牛云对象存储 服务（本地后端版）
 * 处理七牛云配置、上传、下载等操作
 * 所有请求走本地后端 /api/qiniu/*
 */

import { parseJWTPayload } from './auth';

export interface QiniuAttachment {
  id: string;
  note_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  category: string;
  onedrive_path: string;
  onedrive_file_id: string;
  created_at: string;
}

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

export async function saveQiniuConfig(config: {
  access_key: string;
  secret_key: string;
  bucket: string;
  region: string;
  domain: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/qiniu/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(config),
    });
    const data = await response.json();
    return { success: data.success, error: data.error };
  } catch (error) {
    console.error('Save Qiniu config error:', error);
    return { success: false, error: '保存配置失败' };
  }
}

export async function checkQiniuConfig(): Promise<{ bound: boolean; config?: any }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/qiniu/check', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { bound: data.bound, config: data.config };
  } catch (error) {
    console.error('Check Qiniu config error:', error);
    return { bound: false };
  }
}

export async function deleteQiniuConfig(): Promise<{ success: boolean }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/qiniu/config', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json();
    return { success: data.success };
  } catch (error) {
    console.error('Delete Qiniu config error:', error);
    return { success: false };
  }
}

export async function uploadToQiniu(
  noteId: string,
  fileName: string,
  fileContent: string
): Promise<any> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/qiniu/upload', {
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
      if (data.needBind) return { success: false, error: '请先配置七牛云存储' };
      return { success: false, error: data.error };
    }

    return { success: true, data: data.data };
  } catch (error) {
    console.error('Upload to Qiniu error:', error);
    return { success: false, error: '上传失败' };
  }
}

export async function downloadFromQiniu(
  attachmentId: string
): Promise<{ success: boolean; blob?: Blob; fileName?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/qiniu/download?attachment_id=${attachmentId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const data = await response.json();
      if (data.needBind) return { success: false, error: '请先配置七牛云存储' };
      return { success: false, error: data.error || '下载失败' };
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const fileNameMatch = disposition.match(/filename="(.+?)"/);
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'download';

    return { success: true, blob, fileName };
  } catch (error) {
    console.error('Download from Qiniu error:', error);
    return { success: false, error: '下载失败' };
  }
}

export async function getQiniuAttachments(
  noteId?: string
): Promise<{ success: boolean; data?: QiniuAttachment[]; error?: string }> {
  try {
    const token = getAuthToken();
    let url = '/api/qiniu/list';
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
    console.error('Get Qiniu attachments error:', error);
    return { success: false, error: '获取附件列表失败' };
  }
}

export async function deleteQiniuAttachment(
  attachmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/qiniu/delete', {
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
    console.error('Delete Qiniu attachment error:', error);
    return { success: false, error: '删除失败' };
  }
}

export async function checkNotebookQiniu(
  noteId: string
): Promise<{ bound: boolean; isOwner: boolean; access: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/qiniu/check-notebook?note_id=${encodeURIComponent(noteId)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { bound: data.bound, isOwner: data.is_owner, access: data.access };
  } catch (error) {
    console.error('Check notebook Qiniu error:', error);
    return { bound: false, isOwner: false, access: 'none' };
  }
}

export async function checkNotebooksQiniuBatch(
  notebookIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!notebookIds.length) return result;
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/qiniu/check-notebooks-batch?notebook_ids=${encodeURIComponent(notebookIds.join(','))}`, {
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
    console.error('Batch check notebooks Qiniu error:', error);
  }
  return result;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
