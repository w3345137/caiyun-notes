import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './controllers/auth';
import { authRouter as authNativeRouter } from './controllers/auth-native';
import { notesRouter } from './controllers/notes';
import { sharesRouter } from './controllers/shares';
import { edgeFunctionsCompatRouter } from './controllers/edgeFunctionsCompat';
import { supabaseCompatRouter } from './controllers/supabaseCompat';
import { setupWebSocket } from './websocket/server';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3010;
const SUPABASE_AUTH_URL = 'https://mdtbszztcmmdbnvosvpl.supabase.co/auth/v1';

// 中间件
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-supabase-api-version', 'X-Client-Info'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// Auth Proxy (将 Supabase Auth 请求转发到云端)
// ==========================================
app.all('/auth/v1/*', async (req, res) => {
  try {
    const path = req.path.replace('/auth/v1/', '');
    const url = SUPABASE_AUTH_URL + '/' + path + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');

    const headers: any = {};
    if (req.headers['apikey']) headers['apikey'] = req.headers['apikey'];
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers['authorization']) headers['authorization'] = req.headers['authorization'];

    const response = await fetch(url, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    const data = await response.text();
    res.status(response.status).set('Content-Type', 'application/json').send(data);
  } catch (error) {
    res.status(500).json({ error: 'Auth proxy failed' });
  }
});

// 路由
app.use('/auth', authRouter);           // Supabase Auth（本地封装）
app.use('/api/auth', authNativeRouter); // 自建认证系统

app.use('/notes', notesRouter);
app.use('/shares', sharesRouter);

// Edge Functions 兼容路由 (核心数据 API)
app.use('/notes-query', edgeFunctionsCompatRouter);
app.use('/notes-write', edgeFunctionsCompatRouter);
app.use('/shares-query', edgeFunctionsCompatRouter);
app.use('/shares-write', edgeFunctionsCompatRouter);
app.use('/locks-manage', edgeFunctionsCompatRouter);
app.use('/invites-manage', edgeFunctionsCompatRouter);

// Supabase SDK 兼容路由 (数据库查询兼容层)
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
  console.log(`🔐 Auth Proxy: Active (-> Supabase Cloud)`);
  console.log(`📝 Notes API: Active`);
  console.log(`🗄️  Database API: Active`);
});

// 启动 WebSocket
const wss = setupWebSocket(server);

export { app, server, wss };
