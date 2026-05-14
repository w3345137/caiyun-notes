/**
 * 本地认证模块 (替代 Supabase Auth)
 * 完全基于 localStorage 和本地后端 /api/auth/v1/token
 */

const API_BASE = '/api';

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    display_name?: string;
  };
}

export async function signIn(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, grant_type: 'password' })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '账号或密码错误');
  }
  const data: AuthResponse = await res.json();
  localStorage.setItem('notesapp_token', data.access_token);
  return data;
}

export async function signUp(email: string, password: string, displayName: string, verifyToken: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, grant_type: 'signup', display_name: displayName, verifyToken })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '注册失败');
  }
  const data: AuthResponse = await res.json();
  localStorage.setItem('notesapp_token', data.access_token);
  return data;
}

export async function refreshToken(): Promise<AuthResponse> {
  const token = localStorage.getItem('notesapp_token');
  if (!token) throw new Error('未登录');

  const res = await fetch(`${API_BASE}/auth/v1/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '登录续期失败');
  localStorage.setItem('notesapp_token', data.access_token);
  return data as AuthResponse;
}

// 发送验证码
export async function sendVerificationCode(email: string, purpose: 'register' | 'reset-password') {
  const res = await fetch(`${API_BASE}/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, purpose })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '发送验证码失败');
  return data;
}

// 验证验证码
export async function verifyCode(email: string, code: string, purpose: 'register' | 'reset-password') {
  const res = await fetch(`${API_BASE}/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, purpose })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '验证码验证失败');
  return data;
}

// 重置密码
export async function resetPassword(email: string, newPassword: string, verifyToken: string) {
  const res = await fetch(`${API_BASE}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, newPassword, verifyToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '重置密码失败');
  return data;
}

export async function signOut() {
  localStorage.removeItem('notesapp_token');
  window.location.reload();
}

// UTF-8 安全的 JWT payload 解码
export function parseJWTPayload(token: string): any | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(decoded);
  } catch { return null; }
}

export function getCurrentUserId(): string | null {
  const token = localStorage.getItem('notesapp_token');
  if (!token) return null;
  return parseJWTPayload(token)?.sub || null;
}

export function getCurrentUserEmail(): string | null {
  const token = localStorage.getItem('notesapp_token');
  if (!token) return null;
  return parseJWTPayload(token)?.email || null;
}

export function getCurrentUsername(): string | null {
  const token = localStorage.getItem('notesapp_token');
  if (!token) return null;
  const payload = parseJWTPayload(token);
  return payload?.display_name || payload?.username || payload?.email?.split('@')[0] || null;
}

// 兼容旧版代码的导出
export const auth = { signIn, signOut, refreshToken, getCurrentUserId, getCurrentUserEmail };

// 兼容旧版 AdminConsole 等组件的调用
export async function getCurrentUser() {
  const id = getCurrentUserId();
  const email = getCurrentUserEmail();
  const username = getCurrentUsername();
  return id && email ? { id, email, display_name: username || email.split('@')[0], user_metadata: { display_name: username || email.split('@')[0] } } : null;
}

// 兼容旧版 initDatabase 等组件
export const isAuthReady = () => Promise.resolve(true);
export const onAuthStateChange = (cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } });
