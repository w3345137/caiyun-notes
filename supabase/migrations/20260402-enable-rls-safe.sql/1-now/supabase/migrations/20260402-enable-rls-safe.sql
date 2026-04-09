-- 安全审计：安全地启用 RLS（幂等执行）
-- 执行日期：2026-04-02
-- 说明：此脚本只处理已存在的表，不会因为不存在的表而报错

-- ========================================
-- 第一步：查看当前所有表及其 RLS 状态
-- ========================================
SELECT 
  tablename,
  CASE 
    WHEN rowsecurity = true THEN '✅ RLS 已启用'
    ELSE '❌ RLS 未启用'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ========================================
-- 第二步：启用 RLS（只处理已存在的表）
-- ========================================

-- notes 表（核心数据）
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- note_shares 表（共享关系）
ALTER TABLE note_shares ENABLE ROW LEVEL SECURITY;

-- user_profiles 表（用户资料）
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- notebook_invites 表（邀请记录）
ALTER TABLE notebook_invites ENABLE ROW LEVEL SECURITY;

-- update_logs 表（更新日志）
ALTER TABLE update_logs ENABLE ROW LEVEL SECURITY;

-- sidebar_state 表（侧边栏状态）
ALTER TABLE sidebar_state ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 第三步：为缺少策略的表添加策略（先删除再创建，幂等）
-- ========================================

-- user_profiles 表策略
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;

CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND email = '767493611@qq.com'
  ));

CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- sidebar_state 表策略
DROP POLICY IF EXISTS "sidebar_state_select" ON sidebar_state;
DROP POLICY IF EXISTS "sidebar_state_insert" ON sidebar_state;
DROP POLICY IF EXISTS "sidebar_state_update" ON sidebar_state;

CREATE POLICY "sidebar_state_select" ON sidebar_state
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "sidebar_state_insert" ON sidebar_state
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "sidebar_state_update" ON sidebar_state
  FOR UPDATE USING (user_id = auth.uid());

-- notebook_invites 表策略
DROP POLICY IF EXISTS "notebook_invites_select" ON notebook_invites;
DROP POLICY IF EXISTS "notebook_invites_insert" ON notebook_invites;
DROP POLICY IF EXISTS "notebook_invites_update" ON notebook_invites;

CREATE POLICY "notebook_invites_select" ON notebook_invites
  FOR SELECT USING (
    target_user_id = auth.uid() 
    OR shared_by = auth.uid()
  );

CREATE POLICY "notebook_invites_insert" ON notebook_invites
  FOR INSERT WITH CHECK (shared_by = auth.uid());

CREATE POLICY "notebook_invites_update" ON notebook_invites
  FOR UPDATE USING (target_user_id = auth.uid());

-- ========================================
-- 第四步：最终验证
-- ========================================
SELECT 
  t.tablename,
  CASE 
    WHEN t.rowsecurity = false THEN '❌ RLS 未启用'
    WHEN p.policy_count = 0 THEN '⚠️ RLS 已启用但没有策略'
    ELSE '✅ 安全'
  END as status,
  COALESCE(p.policy_count, 0) as policy_count
FROM pg_tables t
LEFT JOIN (
  SELECT schemaname, tablename, COUNT(*) as policy_count
  FROM pg_policies
  GROUP BY schemaname, tablename
) p ON t.schemaname = p.schemaname AND t.tablename = p.tablename
WHERE t.schemaname = 'public'
ORDER BY t.tablename;
