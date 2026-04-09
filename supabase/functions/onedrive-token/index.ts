/**
 * 存储 OneDrive Access Token
 * 前端拿到 token 后，调用此函数存储到数据库
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // CORS 预检
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
    const { user_id, access_token, refresh_token, expires_in, drive_id, drive_type } = await req.json();

    if (!user_id || !access_token) {
      return new Response('Missing required fields', { status: 400 });
    }

    // 计算过期时间
    const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // 使用 service role key 直接写入数据库
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 更新现有记录，保留 client_id 和 client_secret
    const { data, error } = await supabase
      .from('onedrive_accounts')
      .update({
        access_token,
        refresh_token,
        token_expires_at: tokenExpiresAt,
        drive_id: drive_id || 'me/drive',
        drive_type: drive_type || 'personal',
      })
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
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