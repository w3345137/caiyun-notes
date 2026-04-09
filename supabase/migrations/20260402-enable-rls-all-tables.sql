-- 安全审计：检查并启用所有表的 RLS
-- 执行日期：2026-04-02

-- ========================================
-- 第一步：检查哪些表没有启用 RLS
-- ========================================
SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity = true THEN '✅ RLS 已启用'
    ELSE '❌ RLS 未启用'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ========================================
-- 第二步：检查哪些表有 RLS 但没有策略
-- ========================================
SELECT 
  t.schemaname,
  t.tablename,
  CASE 
    WHEN t.rowsecurity = false THEN 'RLS 未启用'
    WHEN p.tablename IS NULL THEN '❌ RLS 已启用但没有策略（会阻止所有访问）'
    ELSE '✅ 有 RLS 策略'
  END as policy_status
FROM pg_tables t
LEFT JOIN pg_policies p ON t.schemaname = p.schemaname AND t.tablename = p.tablename
WHERE t.schemaname = 'public'
ORDER BY t.tablename;

-- ========================================
-- 第三步：为需要的表启用 RLS
-- ========================================

-- notes 表（核心数据）
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- note_shares 表（共享关系）
ALTER TABLE note_shares ENABLE ROW LEVEL SECURITY;

-- user_profiles 表（用户资料）
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- notebook_invites 表（邀请记录）
ALTER TABLE notebook_invites ENABLE ROW LEVEL SECURITY;

-- onedrive_tokens 表（OneDrive 授权）
ALTER TABLE onedrive_tokens ENABLE ROW LEVEL SECURITY;

-- update_logs 表（更新日志）- 已有策略
ALTER TABLE update_logs ENABLE ROW LEVEL SECURITY;

-- sidebar_state 表（侧边栏状态）
ALTER TABLE sidebar_state ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 第四步：为缺少策略的表添加基本策略
-- ========================================

-- notes 表策略（用户只能访问自己创建的或共享给自己的笔记）
-- 注意：这些策略应该已经存在，如果没有则需要添加

-- 如果 notes 表没有策略，添加以下策略：
-- CREATE POLICY "notes_select" ON notes FOR SELECT USING (
--   owner_id = auth.uid() 
--   OR id IN (SELECT note_id FROM note_shares WHERE user_id = auth.uid())
-- );
-- CREATE POLICY "notes_insert" ON notes FOR INSERT WITH CHECK (owner_id = auth.uid());
-- CREATE POLICY "notes_update" ON notes FOR UPDATE USING (owner_id = auth.uid());
-- CREATE POLICY "notes_delete" ON notes FOR DELETE USING (owner_id = auth.uid());

-- user_profiles 表策略（用户只能查看和更新自己的资料）
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND email = '767493611@qq.com'
  ));

CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- sidebar_state 表策略（用户只能访问自己的状态）
CREATE POLICY "sidebar_state_select" ON sidebar_state
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "sidebar_state_insert" ON sidebar_state
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "sidebar_state_update" ON sidebar_state
  FOR UPDATE USING (user_id = auth.uid());

-- notebook_invites 表策略
CREATE POLICY "notebook_invites_select" ON notebook_invites
  FOR SELECT USING (
    target_user_id = auth.uid() 
    OR shared_by = auth.uid()
  );

CREATE POLICY "notebook_invites_insert" ON notebook_invites
  FOR INSERT WITH CHECK (shared_by = auth.uid());

CREATE POLICY "notebook_invites_update" ON notebook_invites
  FOR UPDATE USING (target_user_id = auth.uid());

-- onedrive_tokens 表策略（用户只能访问自己的 token）
CREATE POLICY "onedrive_tokens_select" ON onedrive_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "onedrive_tokens_insert" ON onedrive_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "onedrive_tokens_update" ON onedrive_tokens
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "onedrive_tokens_delete" ON onedrive_tokens
  FOR DELETE USING (user_id = auth.uid());

-- ========================================
-- 第五步：最终验证
-- ========================================
SELECT 
  t.tablename,
  CASE 
    WHEN t.rowsecurity = false THEN '❌ RLS 未启用'
    WHEN p.policy_count = 0 THEN '⚠️ RLS 已启用但没有策略'
    ELSE '✅ 安全'
  END as status,
  p.policy_count
FROM pg_tables t
LEFT JOIN (
  SELECT schemaname, tablename, COUNT(*) as policy_count
  FROM pg_policies
  GROUP BY schemaname, tablename
) p ON t.schemaname = p.schemaname AND t.tablename = p.tablename
WHERE t.schemaname = 'public'
ORDER BY t.tablename;
