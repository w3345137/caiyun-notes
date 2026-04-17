-- 给 onedrive_accounts 表添加缺失的字段
-- callback 需要: display_name, tenant_id

ALTER TABLE public.onedrive_accounts
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;
