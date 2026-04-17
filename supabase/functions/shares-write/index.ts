/**
 * 分享写入 Edge Function
 * 处理所有需要 bypass RLS 的分享写入操作
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
      case 'shareNotebook': {
        // 分享笔记本给用户
        const { notebookId, email, permission = 'edit' } = params;

        // 先通过邮箱查找用户
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (profileError || !profile) {
          return new Response(JSON.stringify({ success: false, error: `未找到用户 ${email}` }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 写入分享记录
        const { error } = await supabase.from('note_shares').upsert({
          note_id: notebookId,
          share_type: 'user',
          user_id: profile.id,
          permission,
          shared_by: userId,
        });

        if (error) {
          if (error.code === '23505') {
            return new Response(JSON.stringify({ success: false, error: '该用户已在共享列表中' }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'unshareNotebook': {
        // 取消分享
        const { notebookId, email } = params;

        // 先通过邮箱查找用户
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (!profile) {
          return new Response(JSON.stringify({ success: false, error: '用户不存在' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 删除分享记录
        const { error } = await supabase
          .from('note_shares')
          .delete()
          .eq('note_id', notebookId)
          .eq('user_id', profile.id)
          .eq('share_type', 'user');

        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'addShareRecord': {
        // 直接添加分享记录（用于邀请审批通过后）
        const { noteId, targetUserId, permission, sharedBy } = params;

        const { error } = await supabase.from('note_shares').insert({
          note_id: noteId,
          share_type: 'user',
          user_id: targetUserId,
          permission,
          shared_by: sharedBy || userId,
        });

        if (error) {
          if (error.code === '23505') {
            return new Response(JSON.stringify({ success: false, error: '该用户已在共享列表中' }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
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