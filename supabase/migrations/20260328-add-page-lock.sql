-- 页面锁功能：给 notes 表添加锁字段
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS locked_by_name text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_notes_locked ON notes(is_locked) WHERE is_locked = true;
CREATE INDEX IF NOT EXISTS idx_notes_locked_by ON notes(locked_by) WHERE locked_by IS NOT NULL;

-- 添加注释
COMMENT ON COLUMN notes.is_locked IS '页面是否被锁定';
COMMENT ON COLUMN notes.locked_by IS '加锁者用户ID';
COMMENT ON COLUMN notes.locked_by_name IS '加锁者显示名';
COMMENT ON COLUMN notes.locked_at IS '加锁时间';
