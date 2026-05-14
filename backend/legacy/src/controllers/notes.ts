import { Router, Request, Response } from 'express';
import { pool } from '../utils/database';
import { authMiddleware } from '../middleware/auth';
import { broadcastToUser, broadcastToUsers } from '../websocket/server';

const router = Router();

/**
 * 获取用户的所有笔记（树形结构）
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    // 查询用户拥有的笔记 + 共享给用户的笔记
    const result = await pool.query(
      `SELECT DISTINCT n.*
       FROM notes n
       LEFT JOIN note_shares ns ON n.id = ns.notebook_id AND ns.user_id = $1
       WHERE n.owner_id = $1 OR ns.notebook_id IS NOT NULL
       ORDER BY n.order_index ASC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('[Notes] Get notes error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 获取单个笔记
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const noteId = req.params.id;

    const result = await pool.query(
      `SELECT n.*
       FROM notes n
       LEFT JOIN note_shares ns ON n.id = ns.notebook_id AND ns.user_id = $1
       WHERE n.id = $2 AND (n.owner_id = $1 OR ns.notebook_id IS NOT NULL)`,
      [userId, noteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found or no permission',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('[Notes] Get note error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 保存笔记（创建或更新）
 */
router.post('/save', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const userId = req.userId!;
    const note = req.body;

    await client.query('BEGIN');

    // 如果是更新，检查版本冲突
    if (note.id) {
      const existing = await client.query(
        'SELECT version, owner_id, is_locked, locked_by FROM notes WHERE id = $1',
        [note.id]
      );

      if (existing.rows.length > 0) {
        const existingNote = existing.rows[0];

        // 检查权限
        if (existingNote.owner_id !== userId) {
          throw { code: 'PERMISSION_DENIED', message: 'No permission to edit this note' };
        }

        // 检查锁定状态
        if (existingNote.is_locked && existingNote.locked_by !== userId) {
          throw { code: 'PERMISSION_DENIED', message: 'Note is locked by another user' };
        }

        // 乐观锁检查
        if (note.version !== undefined && existingNote.version > note.version) {
          throw {
            code: 'VERSION_CONFLICT',
            message: 'Version conflict',
            serverVersion: existingNote.version,
            clientVersion: note.version
          };
        }
      }
    }

    // 保存笔记
    const saveResult = await client.query(
      `INSERT INTO notes (
        id, title, content, parent_id, type, owner_id,
        order_index, icon, version, is_locked, locked_by,
        locked_by_name, locked_at, created_by, created_by_name,
        updated_by, updated_by_name, root_notebook_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        parent_id = EXCLUDED.parent_id,
        type = EXCLUDED.type,
        order_index = EXCLUDED.order_index,
        icon = EXCLUDED.icon,
        version = notes.version + 1,
        is_locked = EXCLUDED.is_locked,
        locked_by = EXCLUDED.locked_by,
        locked_by_name = EXCLUDED.locked_by_name,
        locked_at = EXCLUDED.locked_at,
        updated_by = EXCLUDED.updated_by,
        updated_by_name = EXCLUDED.updated_by_name,
        updated_at = NOW()
      RETURNING *`,
      [
        note.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        note.title || '未命名',
        note.content || '',
        note.parent_id || null,
        note.type || 'page',
        userId,
        note.order_index ?? 0,
        note.icon || 'doc',
        note.version ?? 0,
        note.is_locked ?? false,
        note.locked_by || null,
        note.locked_by_name || null,
        note.locked_at || null,
        userId,
        note.created_by_name || null,
        userId,
        note.updated_by_name || null,
        note.root_notebook_id || null
      ]
    );

    await client.query('COMMIT');

    const savedNote = saveResult.rows[0];

    // 广播给其他用户（实时协作）
    // 注意：这里简化处理，实际应该广播给所有在线用户
    // broadcastToUsers 需要用户 ID 数组，暂时跳过

    res.json({
      success: true,
      data: savedNote,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[Notes] Save note error:', error);

    if (error.code === 'VERSION_CONFLICT') {
      res.status(409).json({
        success: false,
        error: 'VERSION_CONFLICT',
        serverVersion: error.serverVersion,
        clientVersion: error.clientVersion,
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  } finally {
    client.release();
  }
});

/**
 * 删除笔记
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const noteId = req.params.id;

    // 检查权限
    const checkResult = await pool.query(
      'SELECT owner_id FROM notes WHERE id = $1',
      [noteId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
      });
    }

    if (checkResult.rows[0].owner_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'No permission to delete this note',
      });
    }

    // 级联删除子节点
    await pool.query(
      'DELETE FROM notes WHERE id = $1 OR parent_id = $1',
      [noteId]
    );

    // 广播删除事件
    broadcastToUser(userId, {
      type: 'NOTE_DELETED',
      noteId,
    });

    res.json({
      success: true,
    });
  } catch (error: any) {
    console.error('[Notes] Delete note error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 批量保存笔记（用于同步）
 */
router.post('/batch-save', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const notes = req.body.notes;

    const savedNotes = [];

    for (const note of notes) {
      const result = await pool.query(
        `INSERT INTO notes (
          id, title, content, parent_id, type, owner_id,
          order_index, icon, version, updated_by, updated_by_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          version = notes.version + 1,
          updated_by = EXCLUDED.updated_by,
          updated_by_name = EXCLUDED.updated_by_name,
          updated_at = NOW()
        RETURNING *`,
        [
          note.id,
          note.title,
          note.content,
          note.parent_id,
          note.type,
          userId,
          note.order_index,
          note.icon,
          note.version,
          userId,
          note.updated_by_name
        ]
      );

      savedNotes.push(result.rows[0]);
    }

    res.json({
      success: true,
      data: savedNotes,
    });
  } catch (error: any) {
    console.error('[Notes] Batch save error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export { router as notesRouter };
