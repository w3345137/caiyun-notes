/**
 * 认证模块
 */
export { supabase } from './supabase';

let _cachedUserId: string | null = null;
let _cachedEmail: string | null = null;

// Auth 初始化 Promise，确保 App 渲染前完成
let _authResolve: (uid: string | null) => void;
const authReadyPromise = new Promise<string | null>(r => { _authResolve = r; });

// 标记 authReadyPromise 是否已 resolve
let _authResolved = false;

/** 从 localStorage 直接读 JWT，绕过事件时序问题 */
function restoreFromStorage() {
  try {
    const raw = localStorage.getItem('sb-mdtbszztcmmdbnvosvpl-auth-token');
    if (!raw) return;
    const session = JSON.parse(raw);
    if (session?.access_token) {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      _cachedUserId = payload.sub ?? null;
      _cachedEmail = session.user_email ?? payload.email ?? null;
      // 如果从 localStorage 成功恢复了用户信息，立即 resolve
      // 这样即使 INITIAL_SESSION 事件延迟，也不会阻塞加载
      if (_cachedUserId && !_authResolved) {
        _authResolved = true;
        _authResolve(_cachedUserId);
      }
    }
  } catch {}
}

async function initAuth() {
  // 1. 同步从 localStorage 恢复（最快，同步拿到 userId）
  restoreFromStorage();

  // 2. 注册监听器（在 getSession 之前注册，确保 INITIAL_SESSION 被捕获）
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') {
      _cachedUserId = session?.user?.id ?? null;
      _cachedEmail = session?.user?.email ?? null;
      if (!_authResolved) {
        _authResolved = true;
        _authResolve(_cachedUserId);
      }
      return;
    }
    _cachedUserId = session?.user?.id ?? null;
    _cachedEmail = session?.user?.email ?? null;
    if (!_authResolved) {
      _authResolved = true;
      _authResolve(_cachedUserId);
    }
  });

  // 3. getSession 走网络检查（防漏）
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      _cachedUserId = data.session.user.id;
      _cachedEmail = data.session.user.email ?? null;
      if (!_authResolved) {
        _authResolved = true;
        _authResolve(_cachedUserId);
      }
    } else if (_cachedUserId === null && !_authResolved) {
      _authResolved = true;
      _authResolve(null);
    }
  } catch (e) {
    console.warn('[Auth] getSession failed:', e);
    if (_cachedUserId === null && !_authResolved) {
      _authResolved = true;
      _authResolve(null);
    }
  }
}

initAuth();

// ── 公开接口 ──────────────────────────────────────

/** 等 Auth 完成（同步用户 ID 可用后 resolve） */
export function isAuthReady(): Promise<string | null> {
  return authReadyPromise;
}

/** 同步拿用户 ID（缓存的，快） */
export function getCurrentUserId(): string | null {
  return _cachedUserId;
}

export function getCurrentUserEmail(): string | null {
  return _cachedEmail;
}

/** 同步拿 display_name（从 localStorage session，优先读缓存） */
export function getCachedDisplayNameSync(): string | null {
  try {
    const sessionStr = localStorage.getItem('sb-mdtbszztcmmdbnvosvpl-auth-token');
    if (!sessionStr) return null;
    const session = JSON.parse(sessionStr);
    const meta = session?.user?.user_metadata;
    if (meta?.display_name) return meta.display_name;
    if (meta?.full_name) return meta.full_name;
    // 尝试从 JWT token 解码获取 email
    const token = session?.access_token;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.email) {
          return payload.email.split('@')[0];
        }
      } catch {}
    }
    const email = session?.user?.email;
    if (email) return email.split('@')[0];
    return null;
  } catch {
    return null;
  }
}

export interface User {
  id: string;
  email: string;
  display_name?: string;
  user_metadata?: Record<string, any>;
}

export async function signUp(email: string, password: string, displayName?: string): Promise<{ user: User; token: string }> {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: displayName || email.split('@')[0] } },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('注册失败');
  _cachedUserId = data.user.id;
  _cachedEmail = data.user.email!;
  return {
    user: { id: data.user.id, email: data.user.email!, display_name: (data.user.user_metadata as any)?.display_name || email.split('@')[0], user_metadata: data.user.user_metadata as any },
    token: data.session?.access_token || '',
  };
}

export async function signIn(email: string, password: string): Promise<{ user: User }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('登录失败');
  _cachedUserId = data.user.id;
  _cachedEmail = data.user.email!;
  return {
    user: { id: data.user.id, email: data.user.email!, display_name: (data.user.user_metadata as any)?.display_name || email.split('@')[0], user_metadata: data.user.user_metadata as any },
  };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  _cachedUserId = null;
  _cachedEmail = null;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  _cachedUserId = data.user.id;
  _cachedEmail = data.user.email!;
  const displayName = (data.user.user_metadata as any)?.display_name || data.user.email!.split('@')[0];
  return {
    id: data.user.id,
    email: data.user.email!,
    display_name: displayName,
    user_metadata: data.user.user_metadata as any
  };
}

type AuthCallback = (user: User | null) => void;
const _callbacks: AuthCallback[] = [];

supabase.auth.onAuthStateChange((_, session) => {
  const user: User | null = session?.user
    ? { id: session.user.id, email: session.user.email!, display_name: (session.user.user_metadata as any)?.display_name || session.user.email!.split('@')[0], user_metadata: session.user.user_metadata as any }
    : null;
  _callbacks.forEach(cb => cb(user));
});

export function onAuthStateChange(callback: AuthCallback): { data: { subscription: { unsubscribe: () => void } } } {
  _callbacks.push(callback);
  if (_cachedUserId) callback({ id: _cachedUserId, email: _cachedEmail || '', display_name: (_cachedEmail || '').split('@')[0] });
  else callback(null);
  return { data: { subscription: { unsubscribe: () => { const i = _callbacks.indexOf(callback); if (i !== -1) _callbacks.splice(i, 1); }}}};
}

export async function getUserProfile(userId: string) {
  const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
  return data;
}

export async function updateUserProfile(userId: string, updates: { display_name?: string; avatar_url?: string }) {
  const { data, error } = await supabase.from('user_profiles').update(updates).eq('id', userId);
  if (error) throw new Error(error.message);
  return data;
}
