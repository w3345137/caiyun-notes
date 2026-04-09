/**
 * Supabase 客户端
 * 使用 anon key，依赖 RLS 策略保护数据安全
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mdtbszztcmmdbnvosvpl.supabase.co';
const supabaseAnonKey = 'sb_publishable_jIkZVL8uT5DhCG1FxYbl2g_Wa3r0riw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});
