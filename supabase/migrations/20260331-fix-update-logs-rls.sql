-- 修复 update_logs RLS 策略过于宽松的问题
-- 问题：FOR ALL USING (true) 允许任何人写入
-- 修复：改为只有 service_role 才能写入

-- 删除原有的宽松策略
DROP POLICY IF EXISTS "update_logs_service" ON public.update_logs;

-- 创建新的受限策略：只有 service_role 可以写入
CREATE POLICY "update_logs_service" ON public.update_logs
  FOR ALL USING (auth.role() = 'service_role');
