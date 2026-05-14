import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// 扩展 Express Request 类型
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mdtbszztcmmdbnvosvpl.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_jIkZVL8uT5DhCG1FxYbl2g_Wa3r0riw';

/**
 * JWT 认证中间件
 * 验证 Supabase 颁发的 JWT token
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing authentication token'
      });
    }

    const token = authHeader.split(' ')[1];

    // 验证 JWT token
    const decoded = jwt.verify(token, SUPABASE_ANON_KEY) as any;

    if (!decoded || !decoded.sub) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // 注入用户信息到请求对象
    req.userId = decoded.sub;
    req.userEmail = decoded.email;

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    console.error('[Auth] Token verification failed:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });
  }
}

/**
 * 可选认证中间件（允许未登录访问）
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SUPABASE_ANON_KEY) as any;

    if (decoded && decoded.sub) {
      req.userId = decoded.sub;
      req.userEmail = decoded.email;
    }
  } catch (error) {
    // 忽略错误，允许未登录访问
  }

  next();
}
