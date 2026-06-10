import { parseJWTPayload } from './auth';
import type { Attachment } from './onedriveService';

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

export async function renameAttachment(
  attachmentId: string,
  fileName: string,
): Promise<{ success: boolean; data?: Attachment; error?: string }> {
  try {
    const response = await fetch('/api/attachments/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ attachment_id: attachmentId, file_name: fileName }),
    });

    const data = await response.json();
    if (!response.ok || data.error) return { success: false, error: data.error || '重命名失败' };
    return { success: true, data: data.data };
  } catch (error) {
    console.error('Rename attachment error:', error);
    return { success: false, error: '重命名失败' };
  }
}
