/**
 * OneDrive 绑定 - 生成授权 URL
 * 世纪互联和国际版都使用标准 authorization code 流程
 * redirect_uri 已配置在 Azure 门户
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const AUTH_ENDPOINTS: Record<string, string> = {
  'international': 'https://login.microsoftonline.com',
  '世纪互联': 'https://login.partner.microsoftonline.cn',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const { user_id, client_id, client_secret, cloud_type, tenant_id } = await req.json();

    if (!user_id || !client_id || !client_secret) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cloud = cloud_type === '世纪互联' ? '世纪互联' : 'international';
    const REDIRECT_URI = 'https://mdtbszztcmmdbnvosvpl.supabase.co/functions/v1/onedrive-callback';

    const scope = cloud === '世纪互联'
      ? 'https://microsoftgraph.chinacloudapi.cn/Files.ReadWrite.ALL offline_access'
      : 'Files.ReadWrite.All User.Read offline_access';

    const encodeBase64UrlSafe = (str: string): string => {
      return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    // state 包含所有需要的信息，用于 callback 验证
    // 全部 base64url 编码，避免中文/特殊字符在不同环境下被错误编码
    const state = [
      encodeBase64UrlSafe(user_id),
      encodeBase64UrlSafe(cloud),
      encodeBase64UrlSafe(tenant_id || ''),
      encodeBase64UrlSafe(client_id),
      encodeBase64UrlSafe(client_secret),
      encodeBase64UrlSafe(client_secret), // 保留一份给 callback 写入 DB
    ].join('|');

    // 世纪互联需要用 tenant_id 路径，国际版用 /common
    const authPath = cloud === '世纪互联' && tenant_id
      ? `/${tenant_id}/oauth2/v2.0/authorize`
      : '/common/oauth2/v2.0/authorize';

    const authUrl = new URL(`${AUTH_ENDPOINTS[cloud]}${authPath}`);
    authUrl.searchParams.set('client_id', client_id);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    return new Response(JSON.stringify({
      authUrl: authUrl.toString(),
      state,
      cloud,
    }), {
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
