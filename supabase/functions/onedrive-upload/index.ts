/**
 * OneDrive 文件上传
 * 将文件上传到用户的 OneDrive 彩云笔记目录
 * 支持世纪互联和国际版
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// 获取世纪互联或国际版的 Token 端点
function getTokenEndpoint(cloudType: string, tenantId?: string): string {
  if (cloudType === '世纪互联') {
    const base = 'https://login.partner.microsoftonline.cn';
    return tenantId ? `${base}/${tenantId}/oauth2/v2.0/token` : `${base}/common/oauth2/v2.0/token`;
  }
  return 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
}

// 获取世纪互联或国际版的 Graph API 端点
function getGraphEndpoint(cloudType: string): string {
  if (cloudType === '世纪互联') {
    return 'https://microsoftgraph.chinacloudapi.cn/v1.0';
  }
  return 'https://graph.microsoft.com/v1.0';
}

/**
 * 确保文件夹存在，如果不存在则创建
 */
async function ensureFolderExists(accessToken: string, folderPath: string, graphEndpoint: string) {
  const driveId = 'me/drive';
  const url = `${graphEndpoint}/${driveId}:${encodeURIComponent(folderPath)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    // 文件夹不存在，创建它
    const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
    const folderName = folderPath.substring(folderPath.lastIndexOf('/') + 1);

    // 先确保父文件夹存在
    if (parentPath) {
      await ensureFolderExists(accessToken, parentPath, graphEndpoint);
    }

    // 创建文件夹
    const createUrl = `${graphEndpoint}/${driveId}:${encodeURIComponent(parentPath || '/')}:/children`;
    await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // 验证用户身份：从 Authorization header 解析 JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let jwtUserId: string;
    try {
      const token = authHeader.substring(7);
      const payload = JSON.parse(atob(token.split('.')[1]));
      jwtUserId = payload.sub;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!jwtUserId) {
      return new Response(JSON.stringify({ error: 'Invalid token: missing sub' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, note_id, file_name, file_content, folder_path, folder_name } = await req.json();

    // 验证请求中的 user_id 与 JWT 中的用户身份匹配
    if (user_id !== jwtUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: user mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!user_id || !file_name || !file_content) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 使用 service role key 读取用户的 OneDrive token
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: account, error: accountError } = await supabase
      .from('onedrive_accounts')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'OneDrive not bound', needBind: true }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // client_id/client_secret 仅用于 token 刷新，没有则跳过刷新直接用现有 token
    const canRefresh = !!(account.client_id && account.client_secret);

    // 构建 OneDrive 路径
    const basePath = '/彩云笔记';
    const notePath = note_id ? `${basePath}/${note_id}` : basePath;
    const folderPath = folder_path || '/';
    const fullFolderPath = folderPath === '/' ? notePath : `${notePath}/${folder_name || folderPath}`;
    const fullPath = `${fullFolderPath}/${file_name}`;

    // 将 base64 转换为 ArrayBuffer
    const binaryContent = Uint8Array.from(atob(file_content), c => c.charCodeAt(0));

    // 检查 token 是否过期，如果快过期则刷新
    let accessToken = account.access_token;
    const tokenExpiresAt = new Date(account.token_expires_at).getTime();
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 提前5分钟刷新

    if (canRefresh && tokenExpiresAt - now < bufferTime && account.refresh_token) {
      // 刷新 token（根据 cloud_type 选择正确端点）
      const cloudType = account.cloud_type || 'international';
      const tokenEndpoint = getTokenEndpoint(cloudType, account.tenant_id);
      const refreshResponse = await fetch(
        tokenEndpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: account.client_id,
            client_secret: account.client_secret,
            refresh_token: account.refresh_token,
            grant_type: 'refresh_token',
          }),
        }
      );

      if (refreshResponse.ok) {
        const newTokens = await refreshResponse.json();
        accessToken = newTokens.access_token;

        // 更新数据库中的 token
        await supabase
          .from('onedrive_accounts')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || account.refresh_token,
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          })
          .eq('user_id', user_id);
      }
    }

    // 根据 cloud_type 选择正确的 Graph API 端点
    const cloudType = account.cloud_type || 'international';
    const graphEndpoint = getGraphEndpoint(cloudType);

    // 确保文件夹存在
    await ensureFolderExists(accessToken, fullFolderPath, graphEndpoint);

    // 上传文件 - 优先使用 uploadSession（世纪互联可能需要这种方式）
    const driveId = account.drive_id || 'me/drive';
    const mimeType = getMimeType(file_name);

    let uploadResponse: Response;
    let uploadResult: any;

    // 方法1：尝试 uploadSession 方式（先创建会话，再上传内容）
    try {
      const sessionUrl = `${graphEndpoint}/${driveId}:${encodeURIComponent(fullFolderPath)}:/${encodeURIComponent(file_name)}:/createUploadSession`;

      const sessionResponse = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'replace',
          },
        }),
      });

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json();
        const uploadUrl = sessionData.uploadUrl;

        // 用 PUT 上传内容到 session URL
        uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
          },
          body: binaryContent,
        });

        if (uploadResponse.ok) {
          uploadResult = await uploadResponse.json();
        }
      } else {
        // session 创建失败，尝试直接上传
        const directUrl = `${graphEndpoint}/${driveId}:${encodeURIComponent(fullPath)}:/content`;
        uploadResponse = await fetch(directUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': mimeType,
          },
          body: binaryContent,
        });

        if (uploadResponse.ok) {
          uploadResult = await uploadResponse.json();
        }
      }
    } catch (sessionError) {
      // session 方式出错，回退到直接上传
      const directUrl = `${graphEndpoint}/${driveId}:${encodeURIComponent(fullPath)}:/content`;
      uploadResponse = await fetch(directUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': mimeType,
        },
        body: binaryContent,
      });

      if (uploadResponse.ok) {
        uploadResult = await uploadResponse.json();
      }
    }

    // 检查上传结果
    if (!uploadResponse || !uploadResponse.ok) {
      const errorText = uploadResponse ? await uploadResponse.text() : 'No response';
      return new Response(JSON.stringify({
        error: 'Upload failed',
        status: uploadResponse?.status || 0,
        details: errorText
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 只有在还没有结果时才读取 body（避免重复消费）
    if (!uploadResult) {
      uploadResult = await uploadResponse.json();
    }

    // 将附件记录写入数据库
    const fileSize = binaryContent.length;

    const { data: attachment, error: attachError } = await supabase
      .from('attachments')
      .insert({
        note_id: note_id || null,
        user_id: user_id,
        file_name: file_name,
        file_size: fileSize,
        mime_type: mimeType,
        onedrive_path: fullPath,
        onedrive_file_id: uploadResult.id,
        folder_name: folder_name || '根目录',
        folder_path: folderPath,
        category: getCategory(mimeType),
      })
      .select()
      .single();

    if (attachError) {
      console.error('Database insert error:', attachError);
      return new Response(JSON.stringify({ error: 'Failed to save attachment record', details: attachError.message }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: attachment,
      onedrive_file_id: uploadResult.id,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'zip': 'application/zip',
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

function getCategory(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')) return 'document';
  return 'other';
}