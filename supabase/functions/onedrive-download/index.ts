/**
 * OneDrive 文件下载
 * 从用户的 OneDrive 下载文件
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
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

    const url = new URL(req.url);
    const attachmentId = url.searchParams.get('attachment_id');
    const userId = url.searchParams.get('user_id');
    const onedriveFileId = url.searchParams.get('file_id');

    // 验证请求中的 user_id 与 JWT 中的用户身份匹配
    if (userId !== jwtUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: user mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 如果提供了 attachment_id，先查询附件信息
    let filePath: string;
    let fileName: string;
    let mimeType: string;

    if (attachmentId) {
      const { data: attachment, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('id', attachmentId)
        .eq('user_id', userId)
        .single();

      if (error || !attachment) {
        return new Response(JSON.stringify({ error: 'Attachment not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      filePath = attachment.onedrive_path;
      fileName = attachment.file_name;
      mimeType = attachment.mime_type;
    } else if (onedriveFileId) {
      // 直接通过 file_id 下载
      filePath = onedriveFileId;
      fileName = 'download';
      mimeType = 'application/octet-stream';
    } else {
      return new Response(JSON.stringify({ error: 'Missing attachment_id or file_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取用户的 OneDrive token
    const { data: account, error: accountError } = await supabase
      .from('onedrive_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'OneDrive not bound', needBind: true }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // client_id/client_secret 仅用于 token 刷新，没有则跳过刷新直接用现有 token
    const canRefresh = !!(account.client_id && account.client_secret);

    // 检查 token 是否过期
    let accessToken = account.access_token;
    const tokenExpiresAt = new Date(account.token_expires_at).getTime();
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000;

    if (canRefresh && tokenExpiresAt - now < bufferTime && account.refresh_token) {
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

        await supabase
          .from('onedrive_accounts')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || account.refresh_token,
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          })
          .eq('user_id', userId);
      }
    }

    // 下载文件（根据 cloud_type 选择正确的 Graph API 端点）
    const cloudType = account.cloud_type || 'international';
    const graphEndpoint = getGraphEndpoint(cloudType);
    const driveId = account.drive_id || 'me/drive';

    let downloadUrl: string;
    if (attachmentId) {
      // 通过路径下载
      downloadUrl = `${graphEndpoint}/${driveId}:${encodeURIComponent(filePath)}:/content`;
    } else {
      // 通过 file_id 下载
      downloadUrl = `${graphEndpoint}/${driveId}/items/${onedriveFileId}/content`;
    }

    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OneDrive download failed:', errorText);
      return new Response(JSON.stringify({ error: 'Download failed', details: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const content = await response.arrayBuffer();

    return new Response(content, {
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': content.byteLength.toString(),
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});