import { Router, Request, Response } from 'express';
import { pool } from '../utils/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * 获取笔记本的共享用户列表
 */
router.get('/:notebookId/shares', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const notebookId = req.params.notebookId;

    const result = await pool.query(
      `SELECT ns.*, up.email, up.display_name
       FROM note_shares ns
       LEFT JOIN user_profiles up ON ns.user_id = up.id
       WHERE ns.notebook_id = $1 AND ns.shared_by = $2`,
      [notebookId, userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('[Shares] Get shares error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 共享笔记本给用户
 */
router.post('/share', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { notebook_id, email, permission } = req.body;

    // 查找目标用户
    const targetUser = await pool.query(
      'SELECT id, email FROM user_profiles WHERE email = $1',
      [email]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const targetUserId = targetUser.rows[0].id;

    // 添加共享记录
    const result = await pool.query(
      `INSERT INTO note_shares (notebook_id, user_id, shared_by, permission)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (notebook_id, user_id) DO UPDATE SET
         permission = EXCLUDED.permission
       RETURNING *`,
      [notebook_id, targetUserId, userId, permission || 'edit']
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('[Shares] Share note error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 取消共享
 */
router.delete('/:notebookId/unshare', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { email } = req.body;
    const notebookId = req.params.notebookId;

    // 查找目标用户
    const targetUser = await pool.query(
      'SELECT id FROM user_profiles WHERE email = $1',
      [email]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    await pool.query(
      'DELETE FROM note_shares WHERE notebook_id = $1 AND user_id = $2 AND shared_by = $3',
      [notebookId, targetUser.rows[0].id, userId]
    );

    res.json({
      success: true,
    });
  } catch (error: any) {
    console.error('[Shares] Unshare error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export { router as sharesRouter };
