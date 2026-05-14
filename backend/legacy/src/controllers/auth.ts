import { Router, Request, Response } from 'express';
import { pool } from '../utils/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * 获取当前用户信息
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      'SELECT id, email, display_name, full_name, avatar_url, created_at FROM user_profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('[Auth] Get user profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 更新用户资料
 */
router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { display_name, full_name, avatar_url } = req.body;

    const result = await pool.query(
      `UPDATE user_profiles
       SET display_name = COALESCE($1, display_name),
           full_name = COALESCE($2, full_name),
           avatar_url = COALESCE($3, avatar_url),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, display_name, full_name, avatar_url`,
      [display_name, full_name, avatar_url, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('[Auth] Update profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export { router as authRouter };
