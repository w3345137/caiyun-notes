import { parseJWTPayload } from './auth';
import type { Attachment } from './onedriveService';

export interface AnyShareDocLib {
  id: string;
  docid: string;
  name: string;
  type?: string;
}

export interface AnyShareAccount {
  user_id: string;
  base_url: string;
  client_id: string;
  root_docid: string;
  root_name?: string;
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

function authHeaders(json = false): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    'Authorization': `Bearer ${getAuthToken()}`,
  };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function checkAnyShareBinding(): Promise<{ bound: boolean; account?: AnyShareAccount }> {
  try {
    const response = await fetch('/api/anyshare/check', { headers: authHeaders() });
    const data = await response.json();
    return { bound: !!data.bound, account: data.account };
  } catch (error) {
    console.error('Check AnyShare binding error:', error);
    return { bound: false };
  }
}

export async function saveAnyShareConfig(config: {
  base_url: string;
  client_id: string;
  client_secret: string;
  root_docid: string;
  root_name?: string;
}): Promise<{ success: boolean; error?: string; account?: AnyShareAccount }> {
  try {
    const response = await fetch('/api/anyshare/save', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(config),
    });
    const data = await response.json();
    return { success: !!data.success, error: data.error, account: data.account };
  } catch (error) {
    console.error('Save AnyShare config error:', error);
    return { success: false, error: '保存 AnyShare 配置失败' };
  }
}

export async function listAnyShareDocLibs(config?: {
  base_url: string;
  client_id: string;
  client_secret: string;
}): Promise<{ success: boolean; data?: AnyShareDocLib[]; error?: string }> {
  try {
    const response = await fetch('/api/anyshare/doc-libs', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(config || {}),
    });
    const data = await response.json();
    return { success: !!data.success, data: data.data || [], error: data.error };
  } catch (error) {
    console.error('List AnyShare doc libs error:', error);
    return { success: false, error: '获取 AnyShare 文档库失败' };
  }
}

export async function testAnyShareConfig(config?: {
  base_url: string;
  client_id: string;
  client_secret: string;
}): Promise<{ success: boolean; message?: string; error?: string; data?: AnyShareDocLib[] }> {
  try {
    const response = await fetch('/api/anyshare/test', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(config || {}),
    });
    const data = await response.json();
    return { success: !!data.success, message: data.message, error: data.error, data: data.data || [] };
  } catch (error) {
    console.error('Test AnyShare config error:', error);
    return { success: false, error: 'AnyShare 连接测试失败' };
  }
}

export async function unbindAnyShare(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/anyshare/unbind', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({}),
    });
    const data = await response.json();
    return { success: !!data.success, error: data.error };
  } catch (error) {
    console.error('Unbind AnyShare error:', error);
    return { success: false, error: '解绑 AnyShare 失败' };
  }
}

export async function checkNotebookAnyShare(noteId: string): Promise<{ bound: boolean; isOwner: boolean; access: string }> {
  try {
    const response = await fetch(`/api/anyshare/check-notebook?note_id=${encodeURIComponent(noteId)}`, {
      headers: authHeaders(),
    });
    const data = await response.json();
    return { bound: !!data.bound, isOwner: !!data.is_owner, access: data.access || 'none' };
  } catch (error) {
    console.error('Check notebook AnyShare error:', error);
    return { bound: false, isOwner: false, access: 'none' };
  }
}

export async function checkNotebooksAnyShareBatch(notebookIds: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!notebookIds.length) return result;
  try {
    const response = await fetch(`/api/anyshare/check-notebooks-batch?notebook_ids=${encodeURIComponent(notebookIds.join(','))}`, {
      headers: authHeaders(),
    });
    const data = await response.json();
    if (Array.isArray(data.data)) {
      for (const item of data.data) result.set(item.notebook_id, !!item.bound);
    }
  } catch (error) {
    console.error('Batch check AnyShare error:', error);
  }
  return result;
}

export async function uploadToAnyShare(file: File, noteId: string): Promise<{ success: boolean; data?: Attachment; error?: string }> {
  try {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: `文件大小超过限制（最大50MB），当前文件: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
    }
    const response = await fetch('/api/anyshare/upload', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        note_id: noteId,
        file_name: file.name,
        file_content: await fileToBase64(file),
      }),
    });
    const data = await response.json();
    if (data.error) {
      if (data.needBind) return { success: false, error: '请先绑定 AnyShare' };
      return { success: false, error: data.error };
    }
    return { success: true, data: data.data };
  } catch (error) {
    console.error('Upload to AnyShare error:', error);
    return { success: false, error: '上传到 AnyShare 失败' };
  }
}

export async function downloadFromAnyShare(attachmentId: string): Promise<{ success: boolean; blob?: Blob; fileName?: string; error?: string }> {
  try {
    const response = await fetch(`/api/anyshare/download?attachment_id=${encodeURIComponent(attachmentId)}`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data.error || '下载失败' };
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const fileNameMatch = disposition.match(/filename="(.+?)"/);
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'download';
    return { success: true, blob, fileName };
  } catch (error) {
    console.error('Download from AnyShare error:', error);
    return { success: false, error: '下载失败' };
  }
}

export async function getAnyShareAttachments(noteId?: string): Promise<{ success: boolean; data?: Attachment[]; error?: string }> {
  try {
    let url = '/api/anyshare/list';
    if (noteId) url += `?note_id=${encodeURIComponent(noteId)}`;
    const response = await fetch(url, { headers: authHeaders() });
    const data = await response.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true, data: data.data || [] };
  } catch (error) {
    console.error('Get AnyShare attachments error:', error);
    return { success: false, error: '获取 AnyShare 附件失败' };
  }
}

export async function deleteAnyShareAttachment(attachmentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/anyshare/delete', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ attachment_id: attachmentId }),
    });
    const data = await response.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true };
  } catch (error) {
    console.error('Delete AnyShare attachment error:', error);
    return { success: false, error: '删除失败' };
  }
}
