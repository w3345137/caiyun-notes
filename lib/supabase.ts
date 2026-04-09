/**
 * Supabase 客户端 + 直接用 REST API 做认证
 * 不依赖 Supabase SDK 的 cookie/session 机制
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mdtbszztcmmdbnvosvpl.supabase.co';
const supabaseAnonKey = 'sb_publishable_jIkZVL8uT5DhCG1FxYbl2g_Wa3r0riw';

// service_role key（绕过 RLS，用于跨用户查询：加载共享笔记本、获取用户信息等）
// ⚠️ 仅限后端/Edge Functions 使用，禁止出现在客户端代码中
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdGJzenp0Y21tZGJudm9zdnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAwODQ2MywiZXhwIjoyMDg5NTg0NDYzfQ.seqAEkNgW0Bo7Zwxx53SpXHe8T82b_WVtUK9z85vO9Q';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

// service_role client（绕过 RLS，仅用于需要跨用户操作的场景）
// 使用说明：此 client 在浏览器中可用，但会绕过 RLS 策略，请确保操作经过权限校验
export const serviceClient = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
