import { Router, Request, Response } from 'express';
import { pool } from '../utils/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * 兼容 Edge Functions 格式的统一入口
 * 使旧前端无需修改即可调用新后端
 */
router.post('/:functionName', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { action, ...params } = req.body;
  const functionName = req.params.functionName;

  try {
    switch (functionName) {
      // ========== 笔记查询 ==========
      case 'notes-query':
        switch (action) {
          case 'loadFullTree': {
            const result = await pool.query(
              `SELECT n.*
               FROM notes n
               LEFT JOIN note_shares ns ON n.id = ns.notebook_id AND ns.user_id = $1
               WHERE n.owner_id = $1 OR ns.notebook_id IS NOT NULL
               ORDER BY n.order_index ASC`,
              [userId]
            );
            return res.json({ success: true, data: result.rows });
          }

          case 'loadSidebarState': {
            const result = await pool.query(
              'SELECT expanded_nodes, selected_note_id FROM sidebar_state WHERE user_id = $1',
              [userId]
            );
            const state = result.rows[0] || { expanded_nodes: [], selected_note_id: null };
            return res.json({ success: true, data: state });
          }

          default:
            return res.json({ success: false, error: `Unknown action: ${action}` });
        }

      // ========== 笔记写入 ==========
      case 'notes-write':
        switch (action) {
          case 'saveNote': {
            const { note, expectedVersion } = params;

            // 乐观锁检查
            if (note.id && expectedVersion !== undefined) {
              const existing = await pool.query(
                'SELECT version, owner_id, is_locked, locked_by FROM notes WHERE id = $1',
                [note.id]
              );

              if (existing.rows.length > 0) {
                const row = existing.rows[0];
                if (row.owner_id !== userId) {
                  return res.json({ success: false, error: 'No permission' });
                }
                if (row.is_locked && row.locked_by !== userId) {
                  return res.json({ success: false, error: 'Page is locked' });
                }
                if (row.version > expectedVersion) {
                  return res.json({
                    success: false,
                    error: 'VERSION_CONFLICT',
                    serverVersion: row.version,
                    clientVersion: expectedVersion
                  });
                }
              }
            }

            // 保存笔记
            const result = await pool.query(
              `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, version, updated_by, updated_by_name, created_by, created_by_name, root_notebook_id, is_locked, locked_by, locked_by_name, locked_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
               ON CONFLICT (id) DO UPDATE SET
                 title = EXCLUDED.title,
                 content = EXCLUDED.content,
                 parent_id = EXCLUDED.parent_id,
                 type = EXCLUDED.type,
                 order_index = EXCLUDED.order_index,
                 icon = EXCLUDED.icon,
                 version = notes.version + 1,
                 updated_by = EXCLUDED.updated_by,
                 updated_by_name = EXCLUDED.updated_by_name,
                 updated_at = NOW()
               RETURNING *`,
              [
                note.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                note.title || '无标题',
                note.content || '',
                note.parent_id || null,
                note.type || 'page',
                userId,
                note.order ?? 0,
                note.icon || 'doc',
                note.version ?? 0,
                userId,
                note.updated_by_name || '',
                userId,
                note.created_by_name || '',
                note.root_notebook_id || null,
                note.is_locked ?? false,
                note.locked_by || null,
                note.locked_by_name || null,
                note.locked_at || null
              ]
            );

            return res.json({ success: true, data: result.rows[0] });
          }

          case 'deleteNote': {
            const { noteId, allDescendantIds } = params;
            await pool.query('DELETE FROM notes WHERE id = $1 OR parent_id = $1', [noteId]);
            return res.json({ success: true });
          }

          default:
            return res.json({ success: false, error: `Unknown action: ${action}` });
        }

      // ========== 分享查询 ==========
      case 'shares-query':
        switch (action) {
          case 'getSharedNotebooks': {
            const result = await pool.query(
              `SELECT n.* FROM notes n
               INNER JOIN note_shares ns ON n.id = ns.notebook_id
               WHERE ns.user_id = $1`,
              [userId]
            );
            return res.json({ success: true, data: result.rows });
          }

          case 'getNotebookShares': {
            const { notebookId } = params;
            const result = await pool.query(
              `SELECT ns.*, up.email, up.display_name
               FROM note_shares ns
               LEFT JOIN user_profiles up ON ns.user_id = up.id
               WHERE ns.notebook_id = $1`,
              [notebookId]
            );
            return res.json({ success: true, data: result.rows });
          }

          default:
            return res.json({ success: false, error: `Unknown action: ${action}` });
        }

      // ========== 分享写入 ==========
      case 'shares-write':
        switch (action) {
          case 'shareNotebook': {
            const { notebookId, email, permission } = params;
            const targetUser = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
            if (targetUser.rows.length === 0) {
              return res.json({ success: false, error: 'User not found' });
            }
            await pool.query(
              `INSERT INTO note_shares (notebook_id, user_id, shared_by, permission)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (notebook_id, user_id) DO UPDATE SET permission = EXCLUDED.permission`,
              [notebookId, targetUser.rows[0].id, userId, permission || 'edit']
            );
            return res.json({ success: true });
          }

          case 'unshareNotebook': {
            const { notebookId, email } = params;
            const targetUser = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
            if (targetUser.rows.length > 0) {
              await pool.query(
                'DELETE FROM note_shares WHERE notebook_id = $1 AND user_id = $2 AND shared_by = $3',
                [notebookId, targetUser.rows[0].id, userId]
              );
            }
            return res.json({ success: true });
          }

          default:
            return res.json({ success: false, error: `Unknown action: ${action}` });
        }

      default:
        return res.json({ success: false, error: `Unknown function: ${functionName}` });
    }
  } catch (error: any) {
    console.error(`[EF Compat] Error in ${functionName}/${action}:`, error);
    return res.json({ success: false, error: error.message || 'Internal error' });
  }
});

export { router as edgeFunctionsCompatRouter };
