import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';

// 存储用户连接
const userConnections = new Map<string, WebSocket>();

/**
 * 设置 WebSocket 服务器
 */
export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    perMessageDeflate: true
  });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('[WS] Client connected');

    // 解析用户 ID（从 URL 参数或第一条消息）
    let userId: string = '';

    ws.on('message', (message: WebSocket.Data) => {
      try {
        const data = JSON.parse(message.toString());

        // 认证消息
        if (data.type === 'AUTH' && data.userId) {
          userId = data.userId;
          userConnections.set(userId, ws);
          console.log(`[WS] User ${userId} authenticated`);

          ws.send(JSON.stringify({
            type: 'AUTH_SUCCESS',
            message: 'Connected successfully',
          }));
        }
      } catch (error) {
        console.error('[WS] Invalid message:', error);
      }
    });

    ws.on('close', () => {
      if (userId) {
        userConnections.delete(userId);
        console.log(`[WS] User ${userId} disconnected`);
      }
    });

    ws.on('error', (error) => {
      console.error('[WS] WebSocket error:', error);
    });
  });

  wss.on('error', (error) => {
    console.error('[WS] WebSocketServer error:', error);
  });

  console.log('🚀 WebSocket server started on /ws');
  return wss;
}

/**
 * 广播消息给特定用户
 */
export function broadcastToUser(userId: string, message: any) {
  const ws = userConnections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * 广播消息给多个用户（排除指定用户）
 */
export function broadcastToUsers(excludeUserId: string, message: any) {
  const messageStr = JSON.stringify(message);

  userConnections.forEach((ws, uid) => {
    if (uid !== excludeUserId && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}

/**
 * 广播给所有用户
 */
export function broadcastToAll(message: any) {
  const messageStr = JSON.stringify(message);

  userConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}
