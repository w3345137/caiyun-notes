/**
 * 笔记查询 Edge Function
 * 处理所有需要 bypass RLS 的笔记查询操作
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // CORS 预检
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

    let result: any;

    switch (action) {
      case 'loadFullTree': {
        // 加载完整笔记树（优化版：用 root_notebook_id 替代 BFS 逐层遍历）
        
        // 1. 加载自己拥有的笔记本 ID 列表
        const { data: myNotebooks, error: nbError } = await supabase
          .from('notes')
          .select('id')
          .eq('owner_id', userId)
          .eq('type', 'notebook');

        if (nbError) {
          return new Response(JSON.stringify({ error: nbError.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        const myNotebookIds = (myNotebooks || []).map((n: any) => n.id);

        // 2. 加载自己笔记本下的所有笔记（包括其他用户在我笔记本里创建的内容）
        let owned: any[] = [];
        if (myNotebookIds.length > 0) {
          const { data: ownedTree, error: ownedError } = await supabase
            .from('notes')
            .select('*')
            .in('root_notebook_id', myNotebookIds)
            .order('order_index', { ascending: true });

          if (ownedError) {
            return new Response(JSON.stringify({ error: ownedError.message }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          owned = ownedTree || [];
        }
        console.log('[loadFullTree] 自己笔记本数:', myNotebookIds.length, '| 笔记本子树总数:', owned.length);

        // 3. 查找共享给我的笔记本 ID
        const { data: shares } = await supabase
          .from('note_shares')
          .select('note_id')
          .eq('user_id', userId);

        let sharedNotes: any[] = [];
        if (shares && shares.length > 0) {
          const sharedIds = shares.map((s: any) => s.note_id);
          console.log('[loadFullTree] 共享笔记本IDs:', sharedIds);
          // 4. 用 root_notebook_id 一次查询加载所有共享笔记本的子树
          const { data: sharedTree } = await supabase
            .from('notes')
            .select('*')
            .in('root_notebook_id', sharedIds)
            .order('order_index', { ascending: true });
          sharedNotes = sharedTree || [];
          console.log('[loadFullTree] 共享笔记本子树笔记数:', sharedNotes.length);
        } else {
          console.log('[loadFullTree] 没有共享笔记本记录');
        }

        // 5. 合并 + 去重
        const allNotes = [...owned, ...sharedNotes];
        const seenIds = new Set<string>();
        const deduplicated = allNotes.filter(note => {
          if (seenIds.has(note.id)) return false;
          seenIds.add(note.id);
          return true;
        });

        // 调试：统计
        const lockedPages = deduplicated.filter((n: any) => n.type === 'page' && n.is_locked);
        console.log('[loadFullTree] 最终返回 - 总数:', deduplicated.length, '| 笔记本:', deduplicated.filter((n: any) => n.type === 'notebook').length, '| 分区:', deduplicated.filter((n: any) => n.type === 'section').length, '| 页面:', deduplicated.filter((n: any) => n.type === 'page').length, '| 锁定页面:', lockedPages.length);

        return new Response(JSON.stringify({ success: true, data: deduplicated }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'batchUpdateOrder': {
        // 批量更新排序顺序
        const { items } = params;
        for (const item of items) {
          const { error: updateError } = await supabase
            .from('notes')
            .update({
              order_index: item.order,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          if (updateError) {
            return new Response(JSON.stringify({ error: updateError.message }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'loadSidebarState': {
        // 加载侧边栏状态
        const { data, error } = await supabase
          .from('user_profiles')
          .select('sidebar_state')
          .eq('id', userId)
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true, data: data?.sidebar_state || null }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'saveSidebarState': {
        // 保存侧边栏状态
        const { expandedNodes, selectedNoteId } = params;
        const state = {
          expandedNodes,
          selectedNoteId,
          updatedAt: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('user_profiles')
          .update({ sidebar_state: state })
          .eq('id', userId);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
        break;
      }

      case 'restoreSidebarState': {
        // 恢复侧边栏状态时查询选中节点信息
        const { selectedNoteId } = params;
        const { data: selectedData, error: selectedError } = await supabase
          .from('notes')
          .select('id, type, parent_id')
          .eq('id', selectedNoteId)
          .single();

        if (selectedError) {
          return new Response(JSON.stringify({ error: selectedError.message }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        let sectionData = null;
        if (selectedData?.parent_id) {
          const { data: section } = await supabase
            .from('notes')
            .select('parent_id')
            .eq('id', selectedData.parent_id)
            .single();
          sectionData = section;
        }

        return new Response(JSON.stringify({ success: true, selectedData, sectionData }), {
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