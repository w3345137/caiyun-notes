/**
 * 数据库初始化 - 创建附件相关的表
 * 此函数仅供管理员使用，需要在 Supabase Dashboard 或 CLI 中手动调用一次
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // 简单的密钥验证
  const authHeader = req.headers.get('Authorization');
  const expectedKey = Deno.env.get('ADMIN_SECRET_KEY');

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const results: string[] = [];

  // 1. 创建 onedrive_accounts 表
  const { error: err1 } = await supabase.rpc('exec', {
    sql: `
      CREATE TABLE IF NOT EXISTS public.onedrive_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMPTZ,
        drive_id TEXT,
        drive_type TEXT DEFAULT 'personal',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  });
  results.push(`onedrive_accounts: ${err1 ? err1.message : 'OK'}`);

  // 2. 创建 attachments 表
  const { error: err2 } = await supabase.rpc('exec', {
    sql: `
      CREATE TABLE IF NOT EXISTS public.attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id TEXT REFERENCES public.notes(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_size BIGINT,
        mime_type TEXT,
        onedrive_path TEXT NOT NULL,
        onedrive_file_id TEXT,
        folder_name TEXT DEFAULT '根目录',
        folder_path TEXT DEFAULT '/',
        category TEXT DEFAULT 'other',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  });
  results.push(`attachments: ${err2 ? err2.message : 'OK'}`);

  // 3. 给 onedrive_accounts 添加 callback 需要的额外字段
  const { error: err3 } = await supabase.rpc('exec', {
    sql: `
      ALTER TABLE public.onedrive_accounts
        ADD COLUMN IF NOT EXISTS display_name TEXT,
        ADD COLUMN IF NOT EXISTS tenant_id TEXT,
        ADD COLUMN IF NOT EXISTS client_id TEXT,
        ADD COLUMN IF NOT EXISTS client_secret TEXT;
    `
  });
  results.push(`onedrive_accounts columns: ${err3 ? err3.message : 'OK'}`);

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});