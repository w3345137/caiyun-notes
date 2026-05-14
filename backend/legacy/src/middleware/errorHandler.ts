import { Request, Response, NextFunction } from 'express';

/**
 * 全局错误处理中间件
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('[Error]', err);

  // 数据库错误
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry',
    });
  }

  // 权限错误
  if (err.code === 'PERMISSION_DENIED') {
    return res.status(403).json({
      success: false,
      error: err.message || 'Permission denied',
    });
  }

  // 版本冲突
  if (err.code === 'VERSION_CONFLICT') {
    return res.status(409).json({
      success: false,
      error: 'VERSION_CONFLICT',
      serverVersion: err.serverVersion,
      clientVersion: err.clientVersion,
    });
  }

  // 默认错误
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}

/**
 * 404 处理
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}
