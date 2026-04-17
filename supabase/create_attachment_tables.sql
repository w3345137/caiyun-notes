-- OneDrive 账号绑定表（用户级别）
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

-- 附件表
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
    category TEXT DEFAULT 'other' CHECK (category IN ('document', 'image', 'video', 'audio', 'other')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 策略
ALTER TABLE public.onedrive_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- OneDrive 账号策略：用户只能操作自己的
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
CREATE INDEX IF NOT EXISTS idx_attachments_note_id ON public.attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON public.attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_folder ON public.attachments(user_id, folder_path);
