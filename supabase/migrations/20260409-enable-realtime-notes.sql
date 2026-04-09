-- 启用 notes 表和 note_shares 表的 Realtime 推送
-- 执行日期：2026-04-09

-- 将 notes 表添加到 Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE notes;

-- 将 note_shares 表添加到 Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE note_shares;

-- 验证
SELECT schemaname, tablename FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
ORDER BY tablename;
