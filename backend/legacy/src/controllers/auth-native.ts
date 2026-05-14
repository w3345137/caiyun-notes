import { Router, Request, Response } from 'express';
import { pool } from '../utils/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 环境变量未配置');
}
const TOKEN_EXPIRY = '7d'; // 7 天有效期

// 生成 JWT Token
function generateToken(user: any): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      display_name: user.display_name
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// 注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: '邮箱和密码必填' });
    }

    // 检查邮箱是否已注册
    const existing = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: '该邮箱已注册' });
    }

    // 密码加密
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const result = await pool.query(
      `INSERT INTO user_profiles (id, email, display_name, password_hash, created_at, updated_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, NOW(), NOW())
       RETURNING id, email, display_name, created_at`,
      [email, display_name || email.split('@')[0], passwordHash]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.json({
      success: true,
      data: { user, token }
    });
  } catch (error: any) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: '邮箱和密码必填' });
    }

    // 查找用户
    const result = await pool.query(
      'SELECT id, email, display_name, password_hash FROM user_profiles WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: '邮箱或密码错误' });
    }

    const user = result.rows[0];

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: '邮箱或密码错误' });
    }

    // 生成 Token
    const token = generateToken(user);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name
        },
        token
      }
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前用户信息
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const result = await pool.query(
      'SELECT id, email, display_name, created_at FROM user_profiles WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: '登录已过期' });
    }
    res.status(401).json({ success: false, error: '无效的登录凭证' });
  }
});

// 修改密码
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: '未登录' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { oldPassword, newPassword } = req.body;

    // 验证旧密码
    const result = await pool.query(
      'SELECT password_hash FROM user_profiles WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    const isValidOldPassword = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!isValidOldPassword) {
      return res.status(401).json({ success: false, error: '旧密码错误' });
    }

    // 更新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE user_profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, decoded.sub]
    );

    res.json({ success: true, message: '密码修改成功' });
  } catch (error: any) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as authRouter };
