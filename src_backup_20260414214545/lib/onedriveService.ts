/**
 * OneDrive 服务
 * 处理 OneDrive 绑定、上传、下载等操作
 */


const SUPABASE_URL = 'https://mdtbszztcmmdbnvosvpl.supabase.co';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

export interface OneDriveAccount {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  drive_id: string;
  drive_type: string;
  created_at: string;
  updated_at: string;
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

/**
 * 检查用户是否已绑定 OneDrive
 */
export async function checkOneDriveBinding(userId: string): Promise<{ bound: boolean; account?: OneDriveAccount }> {
  try {
    const response = await fetch(`${FUNCTIONS_URL}/onedrive-check?user_id=${userId}`, {
      method: 'GET',
    });

    const data = await response.json();
    return { bound: data.bound, account: data.account };
  } catch (error) {
    console.error('Check OneDrive binding error:', error);
    return { bound: false };
  }
}

/**
 * 获取 OneDrive 授权 URL
 */
export async function getOneDriveAuthUrl(): Promise<{ authUrl: string; codeVerifier: string }> {
  const response = await fetch(`${FUNCTIONS_URL}/onedrive-bind`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get auth URL');
  }

  const data = await response.json();
  return { authUrl: data.authUrl, codeVerifier: data.codeVerifier };
}

/**
 * 处理 OneDrive OAuth 回调
 * 从 URL 中提取 token 并存储
 */
export async function handleOneDriveCallback(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${FUNCTIONS_URL}/onedrive-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
        drive_id: 'me/drive',
        drive_type: 'personal',
      }),
    });

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (error) {
    console.error('Handle OneDrive callback error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * 上传文件到 OneDrive
 */
export async function uploadToOneDrive(
  userId: string,
  noteId: string | null,
  file: File,
  folderPath: string = '/',
  folderName: string = '根目录'
): Promise<{ success: boolean; data?: Attachment; error?: string }> {
  try {
    // 获取当前 session token
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || '';

    // 将文件转换为 base64
    const base64 = await fileToBase64(file);

    const response = await fetch(`${FUNCTIONS_URL}/onedrive-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        user_id: userId,
        note_id: noteId,
        file_name: file.name,
        file_content: base64,
        folder_path: folderPath,
        folder_name: folderName,
      }),
    });

    // 错误时可能返回 HTML debug 页面，需要容错处理
    let data: any = {};
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // HTML 页面，提取错误信息
      const html = await response.text();
      const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
      const debugMatch = html.match(/<div class="debug">([\s\S]+?)<\/div>/);
      const errorMsg = titleMatch ? titleMatch[1] : '上传失败';
      const debugInfo = debugMatch ? debugMatch[1].replace(/<[^>]+>/g, '') : '';
      console.error('Upload failed HTML:', errorMsg, debugInfo);
      return { success: false, error: errorMsg + (debugInfo ? '\n' + debugInfo : '') };
    }

    if (data.error) {
      if (data.needBind) {
        return { success: false, error: '请先绑定 OneDrive 账号' };
      }
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
  userId: string,
  attachmentId: string
): Promise<{ success: boolean; blob?: Blob; error?: string }> {
  try {
    // 获取当前 session token
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || '';

    const response = await fetch(
      `${FUNCTIONS_URL}/onedrive-download?user_id=${userId}&attachment_id=${attachmentId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );

    if (!response.ok) {
      const data = await response.json();
      if (data.needBind) {
        return { success: false, error: '请先绑定 OneDrive 账号' };
      }
      return { success: false, error: data.error || 'Download failed' };
    }

    const blob = await response.blob();
    return { success: true, blob };
  } catch (error) {
    console.error('Download from OneDrive error:', error);
    return { success: false, error: 'Download failed' };
  }
}

/**
 * 获取附件列表
 */
export async function getAttachments(
  userId: string,
  noteId?: string,
  folderPath?: string
): Promise<{ success: boolean; data?: Attachment[]; error?: string }> {
  try {
    let url = `${FUNCTIONS_URL}/onedrive-list?user_id=${userId}`;
    if (noteId) url += `&note_id=${noteId}`;
    if (folderPath) url += `&folder_path=${encodeURIComponent(folderPath)}`;

    const response = await fetch(url, {
      method: 'GET',
    });

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error };
    }

    return { success: true, data: data.data };
  } catch (error) {
    console.error('Get attachments error:', error);
    return { success: false, error: 'Failed to get attachments' };
  }
}

/**
 * 删除附件
 */
export async function deleteAttachment(
  userId: string,
  attachmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 获取当前 session token
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || '';

    const response = await fetch(`${FUNCTIONS_URL}/onedrive-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        attachment_id: attachmentId,
        user_id: userId,
      }),
    });

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete attachment error:', error);
    return { success: false, error: 'Delete failed' };
  }
}

/**
 * 将文件转换为 base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data:image/...;base64, 前缀
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