/**
 * 笔记写入 Edge Function
 * 处理所有需要 bypass RLS 的笔记写入操作
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
      case 'saveNote': {
        // 保存笔记（upsert，带乐观锁版本校验）
        const { note, expectedVersion } = params;

        // 获取当前用户的显示名称
        let userDisplayName = userId;
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('display_name')
            .eq('id', userId)
            .single();
          userDisplayName = profile?.display_name || userId;
        } catch (e) {
          console.warn('[notes-write] 获取用户信息失败');
        }

        // 查询已有笔记的 owner、创建者信息、当前版本号、锁定状态
        let existingOwnerId = userId;
        let existingCreatedBy = userId;
        let existingCreatedByName = userDisplayName;
        let existingVersion = 0;
        let existingLockedBy: string | null = null;
        let existingLockedByName: string | null = null;
        let existingIsLocked = false;
        try {
          const { data: existing } = await supabase
            .from('notes')
            .select('owner_id, created_by, created_by_name, version, is_locked, locked_by, locked_by_name')
            .eq('id', note.id)
            .maybeSingle();
          if (existing?.owner_id) {
            existingOwnerId = existing.owner_id;
          }
          if (existing?.created_by) {
            existingCreatedBy = existing.created_by;
            existingCreatedByName = existing.created_by_name || existingCreatedByName;
          }
          if (existing?.version !== undefined && existing?.version !== null) {
            existingVersion = existing.version;
          }
          if (existing?.is_locked !== undefined) {
            existingIsLocked = existing.is_locked;
            existingLockedBy = existing.locked_by;
            existingLockedByName = existing.locked_by_name;
          }
        } catch (e) {
          console.warn('[notes-write] 查询已有笔记失败');
        }

        // 🔒 锁定校验：页面被其他人锁定时，禁止保存
        if (note.type === 'page' && existingIsLocked && existingLockedBy && existingLockedBy !== userId) {
          console.warn(`[notes-write] 页面被锁定，禁止保存: locked_by=${existingLockedBy}, userId=${userId}`);
          return new Response(JSON.stringify({
            success: false,
            error: `页面已被 ${existingLockedByName || '其他用户'} 锁定，无法保存`,
          }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 乐观锁版本校验：如果传了 expectedVersion，且数据库中版本号大于它，说明有冲突
        if (expectedVersion !== undefined && existingVersion > expectedVersion) {
          console.warn(`[notes-write] 版本冲突: 数据库版本=${existingVersion}, 期望版本=${expectedVersion}`);
          return new Response(JSON.stringify({
            success: false,
            error: 'VERSION_CONFLICT',
            serverVersion: existingVersion,
            clientVersion: expectedVersion,
          }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        const isNewNote = !existingOwnerId || existingOwnerId === userId;

        // 计算 root_notebook_id
        let rootNotebookId = note.rootNotebookId || null;
        if (note.type === 'notebook') {
          // notebook 的 root 就是自己
          rootNotebookId = note.id;
        } else if (!rootNotebookId && note.parentId) {
          // 从父节点继承 root_notebook_id
          try {
            const { data: parent } = await supabase
              .from('notes')
              .select('root_notebook_id')
              .eq('id', note.parentId)
              .single();
            rootNotebookId = parent?.root_notebook_id || null;
          } catch (e) {
            console.warn('[notes-write] 获取父节点 root_notebook_id 失败');
          }
        }

        const saveData: Record<string, any> = {
          id: note.id,
          title: note.title,
          content: note.content || '',
          parent_id: note.parentId || null,
          type: note.type,
          owner_id: existingOwnerId,
          order_index: note.order ?? 0,
          icon: note.icon || 'doc',
          updated_at: new Date().toISOString(),
          version: note.version ?? 1,
          created_by: isNewNote ? userId : existingCreatedBy,
          created_by_name: isNewNote ? userDisplayName : existingCreatedByName,
          updated_by: userId,
          updated_by_name: userDisplayName,
          is_locked: note.isLocked ?? false,
          locked_by: note.lockedBy ?? null,
          locked_by_name: note.lockedByName ?? null,
          root_notebook_id: rootNotebookId,
        };

        const { error } = await supabase.from('notes').upsert(saveData, { onConflict: 'id' });

        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 验证写入
        const { data: verified } = await supabase
          .from('notes')
          .select('id, version')
          .eq('id', note.id)
          .single();

        if (!verified) {
          return new Response(JSON.stringify({ success: false, error: '保存后验证失败' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          version: verified.version
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'deleteNote': {
        // 删除笔记（支持级联删除后代）
        const { noteId, allDescendantIds } = params;

        // 验证笔记存在
        const { data: existing } = await supabase
          .from('notes')
          .select('id')
          .eq('id', noteId)
          .maybeSingle();

        if (!existing) {
          // 已不存在，视为删除成功
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 删除后代节点
        if (allDescendantIds && allDescendantIds.size > 0) {
          const idsToDelete = [...allDescendantIds].filter(id => id !== noteId);
          if (idsToDelete.length > 0) {
            const { error: batchError } = await supabase
              .from('notes')
              .delete()
              .in('id', idsToDelete);
            if (batchError) {
              return new Response(JSON.stringify({ success: false, error: batchError.message }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              });
            }
          }
        }

        // 删除顶层笔记
        const { error } = await supabase.from('notes').delete().eq('id', noteId);

        if (error) {
          return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // 验证删除
        const { data: verified } = await supabase
          .from('notes')
          .select('id')
          .eq('id', noteId)
          .maybeSingle();

        if (verified) {
          return new Response(JSON.stringify({ success: false, error: '删除后验证失败' }), {
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