/**
 * 邀请管理 Edge Function
 * 处理所有笔记本邀请相关的 CRUD 操作
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
      case 'getReceivedInvites': {
        // 获取收到的邀请（作为笔记本所有者）
        // 先获取当前用户拥有的笔记本ID列表
        const { data: myNotebooks } = await supabase
          .from('notes')
          .select('id')
          .eq('owner_id', userId)
          .eq('type', 'notebook');

        const notebookIds = myNotebooks?.map((n: any) => n.id) || [];
        if (notebookIds.length === 0) {
          return new Response(JSON.stringify({ success: true, data: [] }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 查询这些笔记本收到的邀请
        const { data: invites, error } = await supabase
          .from('notebook_invites')
          .select('*')
          .in('notebook_id', notebookIds)
          .order('created_at', { ascending: false });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 补充关联数据
        const result: any[] = [];
        for (const invite of invites || []) {
          // 获取笔记本标题
          const { data: notebook } = await supabase
            .from('notes')
            .select('title')
            .eq('id', invite.notebook_id)
            .single();

          // 获取申请者信息
          const { data: requester } = await supabase
            .from('user_profiles')
            .select('display_name, email')
            .eq('id', invite.requester_id)
            .single();

          result.push({
            ...invite,
            notebook_title: notebook?.title,
            requester_email: requester?.email,
            requester_name: requester?.display_name,
          });
        }

        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getInviteDetail': {
        // 获取邀请详情
        const { inviteId } = params;
        const { data: invite, error } = await supabase
          .from('notebook_invites')
          .select('*')
          .eq('id', inviteId)
          .single();

        if (error || !invite) {
          return new Response(JSON.stringify({ success: false, error: '邀请不存在' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 获取笔记本信息
        const { data: notebook } = await supabase
          .from('notes')
          .select('title, owner_id')
          .eq('id', invite.notebook_id)
          .single();

        return new Response(JSON.stringify({ success: true, data: { invite, notebook } }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getMyNotebooks': {
        // 获取当前用户拥有的笔记本列表
        const { data: myNotebooks, error } = await supabase
          .from('notes')
          .select('id')
          .eq('owner_id', userId)
          .eq('type', 'notebook');

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, data: myNotebooks || [] }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getNotebookInfo': {
        // 获取笔记本信息（用于创建申请前验证）
        const { notebookId } = params;
        const { data: notebook, error } = await supabase
          .from('notes')
          .select('id, title, owner_id')
          .eq('id', notebookId)
          .eq('type', 'notebook')
          .single();

        if (error || !notebook) {
          return new Response(JSON.stringify({ success: false, error: '笔记本不存在' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, data: notebook }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'getPendingCount': {
        // 获取待处理邀请数量
        const { data: myNotebooks } = await supabase
          .from('notes')
          .select('id')
          .eq('owner_id', userId)
          .eq('type', 'notebook');

        const notebookIds = myNotebooks?.map((n: any) => n.id) || [];
        if (notebookIds.length === 0) {
          return new Response(JSON.stringify({ success: true, count: 0 }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        const { data, error } = await supabase
          .from('notebook_invites')
          .select('id', { count: 'exact' })
          .in('notebook_id', notebookIds)
          .eq('status', 'pending');

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, count: data?.length || 0 }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'respondToInvite': {
        // 审批邀请（approve 或 reject）
        const { inviteId, responseAction, grantedPermission } = params;

        // 获取邀请详情
        const { data: invite, error: inviteError } = await supabase
          .from('notebook_invites')
          .select('*')
          .eq('id', inviteId)
          .single();

        if (inviteError || !invite) {
          return new Response(JSON.stringify({ success: false, error: '邀请不存在' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 获取笔记本信息验证所有者
        const { data: notebookData } = await supabase
          .from('notes')
          .select('title, owner_id')
          .eq('id', invite.notebook_id)
          .single();

        if (notebookData?.owner_id !== userId) {
          return new Response(JSON.stringify({ success: false, error: '只有笔记本所有者可以审批' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        if (invite.status !== 'pending') {
          return new Response(JSON.stringify({ success: false, error: '该申请已被处理' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        if (responseAction === 'approve') {
          // 批准：创建分享记录
          const actualPermission = grantedPermission ?? invite.permission;

          const { error: shareError } = await supabase.from('note_shares').insert({
            note_id: invite.notebook_id,
            share_type: 'user',
            user_id: invite.requester_id,
            permission: actualPermission,
            shared_by: userId,
          });

          if (shareError) {
            return new Response(JSON.stringify({ success: false, error: shareError.message }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          // 更新申请状态
          const { error: updateError } = await supabase
            .from('notebook_invites')
            .update({
              status: 'approved',
              responded_by: userId,
              responded_at: new Date().toISOString(),
              permission: actualPermission,
            })
            .eq('id', inviteId);

          if (updateError) {
            return new Response(JSON.stringify({ success: false, error: '审批失败' }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        } else {
          // 拒绝
          const { error: updateError } = await supabase
            .from('notebook_invites')
            .update({
              status: 'rejected',
              responded_by: userId,
              responded_at: new Date().toISOString(),
            })
            .eq('id', inviteId);

          if (updateError) {
            return new Response(JSON.stringify({ success: false, error: '操作失败' }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
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