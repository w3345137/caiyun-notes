-- 更新日志表
CREATE TABLE IF NOT EXISTS public.update_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  items TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 策略：所有人可读，service role 可写
ALTER TABLE public.update_logs ENABLE ROW LEVEL SECURITY;

-- 所有人可读取
CREATE POLICY "update_logs_read" ON public.update_logs
  FOR SELECT USING (true);

-- service role 可以插入、更新、删除
CREATE POLICY "update_logs_service" ON public.update_logs
  FOR ALL USING (true);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_update_logs_date ON public.update_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_update_logs_version ON public.update_logs(version);
