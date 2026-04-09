/**
 * OneDrive 附件删除
 * 删除指定的附件记录和 OneDrive 中的文件
 * 支持世纪互联和国际版
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
        'Access-Control-Allow-Methods': 'POST, DELETE',
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

    const { attachment_id, user_id } = await req.json();

    // 验证请求中的 user_id 与 JWT 中的用户身份匹配
    if (user_id !== jwtUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: user mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!attachment_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 获取附件信息
    const { data: attachment, error: fetchError } = await supabase
      .from('attachments')
      .select('*')
      .eq('id', attachment_id)
      .eq('user_id', user_id)
      .single();

    if (fetchError || !attachment) {
      return new Response(JSON.stringify({ error: 'Attachment not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取用户的 OneDrive token
    const { data: account, error: accountError } = await supabase
      .from('onedrive_accounts')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (!accountError && account) {
      // 从 OneDrive 删除文件（根据 cloud_type 选择正确的 Graph API 端点）
      const cloudType = account.cloud_type || 'international';
      const graphEndpoint = getGraphEndpoint(cloudType);
      const driveId = account.drive_id || 'me/drive';
      const deleteUrl = `${graphEndpoint}/${driveId}:${encodeURIComponent(attachment.onedrive_path)}`;

      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${account.access_token}` },
      });
    }

    // 从数据库删除记录
    const { error: deleteError } = await supabase
      .from('attachments')
      .delete()
      .eq('id', attachment_id);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
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