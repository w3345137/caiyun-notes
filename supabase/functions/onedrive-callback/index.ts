/**
 * OneDrive OAuth 回调 - 处理微软授权跳转
 * 支持 GET（微软重定向）和 POST（前端轮询）两种方式
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TOKEN_ENDPOINTS: Record<string, string> = {
  'international': 'https://login.microsoftonline.com',
  '世纪互联': 'https://login.partner.microsoftonline.cn',
};

const GRAPH_ENDPOINTS: Record<string, string> = {
  'international': 'https://graph.microsoft.com',
  '世纪互联': 'https://microsoftgraph.chinacloudapi.cn',
};

// 返回给前端的 HTML 页面（成功或失败）
// 添加 postMessage 通知机制，支持 App 环境下的 iframe 授权
const makePage = (title: string, msg: string, isError: boolean, debug?: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 32px 40px; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); text-align: center; max-width: 480px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { margin: 0 0 12px; color: #333; font-size: 20px; }
    p { margin: 0 0 20px; color: #666; font-size: 14px; line-height: 1.5; }
    .error h2 { color: #dc2626; }
    .debug { margin-top: 20px; padding: 12px; background: #f3f4f6; border-radius: 8px; text-align: left; font-size: 11px; color: #666; word-break: break-all; max-height: 200px; overflow-y: auto; }
    .btn { display: inline-block; padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; margin-top: 10px; }
    .btn:hover { background: #2563eb; }
    .btn.gray { background: #6b7280; }
    .btn.gray:hover { background: #4b5563; }
  </style>
</head>
<body>
  <div class="card ${isError ? 'error' : ''}">
    <div class="icon">${isError ? '❌' : '✅'}</div>
    <h2>${title}</h2>
    <p>${msg}</p>
    ${debug ? `<div class="debug"><strong>调试信息：</strong><br>${debug}</div>` : ''}
    <button class="btn ${isError ? 'gray' : ''}" onclick="notifyParent()">完成授权${isError ? '' : '，返回笔记'}</button>
  </div>
  <script>
    // 通知父窗口授权结果
    function notifyParent() {
      try {
        const data = ${isError ? '{ type: \"onedrive_error\", error: ' + JSON.stringify(title + ': ' + msg) + ' }' : '{ type: \"onedrive_success\" }'};
        window.parent.postMessage(data, '*');
        // 如果是 iframe 内的页面，自动关闭
        if (window.parent !== window) {
          // 延迟关闭，等待消息发送
          setTimeout(() => {
            // 尝试通知父窗口（部分浏览器支持）
            window.parent.postMessage({ type: 'close_iframe' }, '*');
          }, 500);
        }
      } catch (e) {
        console.error('postMessage error:', e);
      }
      // 如果是独立窗口，提示用户关闭
      if (!window.opener && window.parent === window) {
        alert('请关闭此窗口并返回笔记');
      }
    }
    // 页面加载完成后自动通知（适用于 iframe 环境）
    window.onload = function() {
      // 延迟执行，等待父窗口准备好
      setTimeout(notifyParent, 1000);
    };
  </script>
</body>
</html>`;

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
    let code: string | null = null;
    let state: string | null = null;
    let error: string | null = null;
    let error_description: string | null = null;

    // 调试：原始请求信息
    const rawUrl = req.url;
    const debugRaw = `RAW_URL: ${rawUrl}`;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      code = url.searchParams.get('code');
      state = url.searchParams.get('state');
      error = url.searchParams.get('error');
      error_description = url.searchParams.get('error_description');
    } else {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await req.json();
        code = body.code;
        state = body.state;
        error = body.error;
        error_description = body.error_description;
      }
    }

    // 调试：显示收到的参数
    const debugInfo = `RAW_URL: ${rawUrl}
code=${code ? code.slice(0, 30) + '...' : 'null'}
state=${state ? state.slice(0, 60) + '...' : 'null'}
state_parts_count=${state ? state.split('|').length : 'N/A'}
error=${error}
error_description=${error_description}`;

    if (error) {
      return new Response(makePage('授权失败', error_description || error, true, debugInfo), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!code || !state) {
      return new Response(makePage('授权失败', '缺少授权码或状态参数', true, debugRaw + '\n\n' + debugInfo), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 调试：显示 state 结构
    const parts = state.split('|');
    const debugParts = parts.map((p, i) => `parts[${i}]=${p.slice(0, 30)}`).join('\n');

    if (parts.length < 6) {
      return new Response(makePage('授权失败', `state 格式错误：期望 6 部分，实际 ${parts.length} 部分\n${state}`, true, debugParts), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const [encodedUserId, encodedCloud, encodedTenantId, encodedClientId, encodedClientSecret, encodedClientSecretDb] = parts;

    const decodeBase64UrlSafe = (str: string): string => {
      const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
      // atob 返回的是 Latin-1 字符串，必须用 TextDecoder 转成 UTF-8
      const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    };

    const user_id = decodeBase64UrlSafe(encodedUserId);
    const cloud = decodeBase64UrlSafe(encodedCloud);
    const tenant_id = decodeBase64UrlSafe(encodedTenantId);
    const client_id = decodeBase64UrlSafe(encodedClientId);
    const client_secret = decodeBase64UrlSafe(encodedClientSecret);
    const client_secret_for_db = decodeBase64UrlSafe(encodedClientSecretDb);

    // 调试：显示解码后的关键值
    const debugDecoded = `cloud=${cloud}
tenant_id=${tenant_id}
client_id=${client_id}
tokenEndpoint=TOKEN_ENDPOINTS[${cloud}]=${TOKEN_ENDPOINTS[cloud]}`;

    // 验证 cloud 类型
    if (!TOKEN_ENDPOINTS[cloud]) {
      return new Response(makePage('授权失败', `未知的云类型: ${cloud}`, true, `TOKEN_ENDPOINTS keys: ${Object.keys(TOKEN_ENDPOINTS).join(', ')}\n\n${debugDecoded}`), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const tokenEndpoint = TOKEN_ENDPOINTS[cloud];
    const tokenPath = tenant_id && tenant_id !== 'undefined' && tenant_id !== ''
      ? `/${tenant_id}/oauth2/v2.0/token`
      : '/common/oauth2/v2.0/token';

    // 用 code 换取 token
    const tokenResponse = await fetch(`${tokenEndpoint}${tokenPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code,
        redirect_uri: 'https://mdtbszztcmmdbnvosvpl.supabase.co/functions/v1/onedrive-callback',
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return new Response(makePage('授权失败', tokens.error_description || tokens.error, true, `tokenUrl=${tokenEndpoint}${tokenPath}\nresponse: ${JSON.stringify(tokens)}`), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { access_token, refresh_token, expires_in } = tokens;

    // 存入数据库
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // 计算 token 过期时间（expires_in 是秒数）
    const token_expires_at = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    const { error: dbError } = await supabase.from('onedrive_accounts').upsert({
      user_id,
      cloud_type: cloud,
      access_token,
      refresh_token,
      token_expires_at,
      tenant_id: tenant_id && tenant_id !== 'undefined' ? tenant_id : null,
      client_id: client_id,
      client_secret: client_secret_for_db,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (dbError) {
      return new Response(makePage('授权失败', '保存账号信息失败：' + dbError.message, true), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(makePage('绑定成功', `已成功绑定 OneDrive 账号<br>请关闭此窗口`, false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('Callback error:', err);
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    return new Response(makePage('授权失败', '服务器内部错误', true, msg), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
