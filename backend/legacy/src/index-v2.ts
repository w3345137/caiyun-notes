import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './controllers/auth';
import { authNativeRouter } from './controllers/auth-native';
import { notesRouter } from './controllers/notes';
import { sharesRouter } from './controllers/shares';
import { edgeFunctionsCompatRouter } from './controllers/edgeFunctionsCompat';
import { supabaseCompatRouter } from './controllers/supabaseCompat';
import { setupWebSocket } from './websocket/server';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3010;

// 中间件
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/auth', authRouter);           // Supabase Auth（保留兼容）
app.use('/api/auth', authNativeRouter); // 自建认证系统

app.use('/notes', notesRouter);
app.use('/shares', sharesRouter);

// Edge Functions 兼容路由
app.use('/notes-query', edgeFunctionsCompatRouter);
app.use('/notes-write', edgeFunctionsCompatRouter);
app.use('/shares-query', edgeFunctionsCompatRouter);
app.use('/shares-write', edgeFunctionsCompatRouter);
app.use('/locks-manage', edgeFunctionsCompatRouter);
app.use('/invites-manage', edgeFunctionsCompatRouter);

// Supabase SDK 兼容路由
app.use('/supabase-compat', supabaseCompatRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理
app.use(errorHandler);

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`🔐 自建认证系统: /api/auth/*`);
  console.log(`📝 Edge Functions 兼容层已启用`);
  console.log(`🔄 Supabase SDK 兼容层已启用`);
});

// 启动 WebSocket
const wss = setupWebSocket(server);

export { app, server, wss };
