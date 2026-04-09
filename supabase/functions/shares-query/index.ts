/**
 * 分享查询 Edge Function
 * 处理所有需要 bypass RLS 的分享查询操作
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
      case 'getNotebookShares': {
        // 获取笔记本的分享列表
        const { notebookId } = params;
        const { data, error } = await supabase
          .from('note_shares')
          .select('*')
          .eq('note_id', notebookId);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 补充用户邮箱信息
        const userIds = (data || []).map((s: any) => s.user_id).filter(Boolean);
        let emailMap: Record<string, string> = {};
        let nameMap: Record<string, string> = {};

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, email, display_name')
            .in('id', userIds);
          (profiles || []).forEach((p: any) => {
            emailMap[p.id] = p.email;
            nameMap[p.id] = p.display_name || p.email;
          });
        }

        const result = (data || []).map((s: any) => ({
          ...s,
          user_email: s.user_id ? (emailMap[s.user_id] || s.user_id) : undefined,
          user_name: s.user_id ? (nameMap[s.user_id] || s.user_id) : undefined,
        }));

        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getSharedNotebooks': {
        // 获取用户可访问的共享笔记本列表
        const { data, error } = await supabase
          .from('note_shares')
          .select('note_id, permission')
          .eq('user_id', userId)
          .eq('share_type', 'user');

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, data: data || [] }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getSharedNotebookIds': {
        // 批量获取当前用户拥有的所有有共享记录的笔记本 ID
        // 替代前端逐个笔记本调用 getNotebookShares 的 N+1 问题
        const { data: ownedShares, error: ownedSharesError } = await supabase
          .from('note_shares')
          .select('note_id')
          .eq('shared_by', userId);

        if (ownedSharesError) {
          return new Response(JSON.stringify({ error: ownedSharesError.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 去重，返回唯一的笔记本 ID 列表
        const uniqueIds = [...new Set((ownedShares || []).map((s: any) => s.note_id))];

        return new Response(JSON.stringify({ success: true, data: uniqueIds }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getUserByEmail': {
        // 通过邮箱查找用户
        const { email } = params;
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (error || !data) {
          return new Response(JSON.stringify({ success: false, error: '用户不存在' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, data }), {
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