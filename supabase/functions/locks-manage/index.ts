/**
 * 页面锁管理 Edge Function
 * 处理所有页面锁定相关的原子操作
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action, userId, ...params } = await req.json();

    switch (action) {
      case 'lockNote': {
        // 原子加锁操作
        const { noteId, userName } = params;

        const { data, error } = await supabase
          .from('notes')
          .update({
            is_locked: true,
            locked_by: userId,
            locked_by_name: userName,
            locked_at: new Date().toISOString(),
          })
          .eq('id', noteId)
          .eq('is_locked', false)  // 只有未锁定时才能加锁
          .select('id, locked_by')
          .single();

        if (error) {
          return new Response(JSON.stringify({ success: false, error: '加锁失败，请重试' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        if (!data) {
          return new Response(JSON.stringify({ success: false, error: '页面已被其他人锁定' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, locked_by: data.locked_by }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'unlockNote': {
        // 解锁操作
        const { noteId, isOwner } = params;

        if (isOwner) {
          // 所有者可以解锁任何人的锁
          const { error } = await supabase
            .from('notes')
            .update({
              is_locked: false,
              locked_by: null,
              locked_by_name: null,
              locked_at: null,
            })
            .eq('id', noteId)
            .eq('is_locked', true);

          if (error) {
            return new Response(JSON.stringify({ success: false, error: '解锁失败' }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        } else {
          // 非所有者只能解锁自己的锁
          const { error } = await supabase
            .from('notes')
            .update({
              is_locked: false,
              locked_by: null,
              locked_by_name: null,
              locked_at: null,
            })
            .eq('id', noteId)
            .eq('locked_by', userId)
            .eq('is_locked', true);

          if (error) {
            return new Response(JSON.stringify({ success: false, error: '解锁失败' }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'refreshLock': {
        // 续期锁
        const { noteId } = params;

        // 先查当前状态
        const { data: note, error: fetchError } = await supabase
          .from('notes')
          .select('id, is_locked, locked_by, locked_at')
          .eq('id', noteId)
          .single();

        if (fetchError || !note) {
          return new Response(JSON.stringify({ success: false, lockRefreshed: false }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 如果页面没人锁定，且是加锁者回来，续期
        if (!note.is_locked && note.locked_by === userId) {
          await supabase
            .from('notes')
            .update({ locked_at: new Date().toISOString() })
            .eq('id', noteId)
            .eq('locked_by', userId);
          return new Response(JSON.stringify({ success: true, lockRefreshed: true, currentLockedBy: null }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 如果页面被他人加锁，原锁永久失效
        if (note.is_locked && note.locked_by !== userId) {
          return new Response(JSON.stringify({ success: true, lockRefreshed: false, currentLockedBy: note.locked_by }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 如果是自己加的锁还在，续期
        if (note.is_locked && note.locked_by === userId) {
          const { error: updateError } = await supabase
            .from('notes')
            .update({ locked_at: new Date().toISOString() })
            .eq('id', noteId)
            .eq('locked_by', userId);

          return new Response(JSON.stringify({
            success: !updateError,
            lockRefreshed: !updateError,
            currentLockedBy: null
          }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, lockRefreshed: false, currentLockedBy: null }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getPageLock': {
        // 获取页面锁状态
        const { noteId } = params;
        const { data, error } = await supabase
          .from('notes')
          .select('is_locked, locked_by, locked_by_name, locked_at')
          .eq('id', noteId)
          .single();

        if (error || !data) {
          return new Response(JSON.stringify({ success: false }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          data: {
            is_locked: data.is_locked,
            locked_by: data.locked_by,
            locked_by_name: data.locked_by_name,
            locked_at: data.locked_at,
          }
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'removeLocksForUser': {
        // 批量移除某用户在某笔记本下的所有锁（包括分区和页面）
        const { notebookId } = params;

        // 获取笔记本的直接子节点（分区）
        const { data: sections } = await supabase
          .from('notes')
          .select('id')
          .eq('parent_id', notebookId)
          .eq('type', 'section');

        const sectionIds = sections?.map((s: any) => s.id) || [];

        // 获取分区下的页面（页面的 parent_id 是分区 ID）
        let pagesInSections: any[] = [];
        if (sectionIds.length > 0) {
          const result = await supabase
            .from('notes')
            .select('id')
            .in('parent_id', sectionIds)
            .eq('locked_by', userId)
            .eq('is_locked', true);
          pagesInSections = result.data || [];
        }

        // 收集所有需要解锁的页面 ID
        const allLockedPages = pagesInSections;

        if (allLockedPages.length === 0) {
          return new Response(JSON.stringify({ success: true, deletedCount: 0 }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        const pageIds = allLockedPages.map((p: any) => p.id);

        // 批量解锁
        const { error: updateError } = await supabase
          .from('notes')
          .update({
            is_locked: false,
            locked_by: null,
            locked_by_name: null,
            locked_at: null,
          })
          .in('id', pageIds);

        if (updateError) {
          return new Response(JSON.stringify({ success: false, deletedCount: 0 }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, deletedCount: allLockedPages.length }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});