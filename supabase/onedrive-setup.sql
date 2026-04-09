-- 清理旧策略（如果存在）
DROP POLICY IF EXISTS "用户可以查看自己的 OneDrive 账号" ON public.onedrive_accounts;
DROP POLICY IF EXISTS "用户可以添加自己的 OneDrive 账号" ON public.onedrive_accounts;
DROP POLICY IF EXISTS "用户可以更新自己的 OneDrive 账号" ON public.onedrive_accounts;
DROP POLICY IF EXISTS "用户可以删除自己的 OneDrive 账号" ON public.onedrive_accounts;

DROP POLICY IF EXISTS "用户可以查看自己的附件" ON public.attachments;
DROP POLICY IF EXISTS "用户可以创建附件" ON public.attachments;
DROP POLICY IF EXISTS "用户可以删除自己的附件" ON public.attachments;

-- 删除旧索引（如果存在）
DROP INDEX IF EXISTS idx_attachments_note_id;
DROP INDEX IF EXISTS idx_attachments_user_id;
DROP INDEX IF EXISTS idx_attachments_folder;

-- 删除旧表（如果存在）
DROP TABLE IF EXISTS public.attachments;
DROP TABLE IF EXISTS public.onedrive_accounts;

-- 创建 OneDrive 账号绑定表
CREATE TABLE public.onedrive_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    cloud_type TEXT DEFAULT 'international',
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    drive_id TEXT,
    drive_type TEXT DEFAULT 'personal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建附件表
CREATE TABLE public.attachments (
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
    category TEXT DEFAULT 'other' CHECK (category IN ('document', 'image', 'video', 'audio', 'other')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.onedrive_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- OneDrive 账号策略
CREATE POLICY "用户可以查看自己的 OneDrive 账号" ON public.onedrive_accounts
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "用户可以添加自己的 OneDrive 账号" ON public.onedrive_accounts
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "用户可以更新自己的 OneDrive 账号" ON public.onedrive_accounts
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "用户可以删除自己的 OneDrive 账号" ON public.onedrive_accounts
    FOR DELETE USING (user_id = auth.uid());

-- 附件策略
CREATE POLICY "用户可以查看自己的附件" ON public.attachments
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "用户可以创建附件" ON public.attachments
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "用户可以删除自己的附件" ON public.attachments
    FOR DELETE USING (user_id = auth.uid());

-- 索引
CREATE INDEX idx_attachments_note_id ON public.attachments(note_id);
CREATE INDEX idx_attachments_user_id ON public.attachments(user_id);
CREATE INDEX idx_attachments_folder ON public.attachments(user_id, folder_path);
