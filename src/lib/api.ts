/**
 * 极简本地 API 客户端 (修复 JWT 解码 Bug)
 */
const API_BASE = '/api'; 

function getToken(): string | null {
  return localStorage.getItem('notesapp_token');
}

function saveToken(token: string): void {
  console.log('[API] Saving token to localStorage');
  localStorage.setItem('notesapp_token', token);
  localStorage.setItem('sb-mdtbszztcmmdbnvosvpl-auth-token', JSON.stringify({ access_token: token }));
}

function clearToken(): void {
  console.warn('[API] Clearing invalid token');
  localStorage.removeItem('notesapp_token');
  localStorage.removeItem('sb-mdtbszztcmmdbnvosvpl-auth-token');
}

// 通用 Fetch 包装器
async function request(path: string, options: any = {}) {
  const token = getToken();
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  console.log(`[API] ${options.method || 'GET'} ${path}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    console.error(`[API] Error: ${data.error || res.statusText}`);
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  async login(email: string, password: string) {
    console.log('[Auth] 尝试登录...', email);
    const data = await request('/auth/v1/token', {
      method: 'POST',
      body: JSON.stringify({ email, password, grant_type: 'password' })
    });
    if (data.access_token) {
      saveToken(data.access_token);
      console.log('[Auth] 登录成功! Token 已保存');
      return data;
    }
    throw new Error('登录失败');
  },

  async logout() {
    clearToken();
    console.log('[Auth] 已登出');
  },

  async getUser() {
    const token = getToken();
    if (!token) {
       console.log('[Auth] No token found');
       return null;
    }
    try {
      // 修复：将 Base64Url 转换为标准 Base64 以兼容 atob
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      
      console.log('[Auth] Token parsed successfully:', payload.email);
      return { id: payload.sub, email: payload.email };
    } catch (e) {
      console.error('[Auth] Token parsing failed:', e);
      clearToken();
      return null;
    }
  },

  async getNotes() {
    console.log('[Notes] 加载笔记列表...');
    return request('/notes-query', {
      method: 'POST',
      body: JSON.stringify({ action: 'loadFullTree' })
    });
  },

  async saveNote(note: any) {
    console.log('[Notes] 保存笔记:', note.id);
    return request('/notes-write', {
      method: 'POST',
      body: JSON.stringify({ action: 'saveNote', note })
    });
  },

  async deleteNote(noteId: string) {
    console.log('[Notes] 删除笔记:', noteId);
    return request('/notes-write', {
      method: 'POST',
      body: JSON.stringify({ action: 'deleteNote', noteId })
    });
  },
  
  async getSidebarState() {
     return request('/notes-query', { method: 'POST', body: JSON.stringify({ action: 'loadSidebarState' }) });
  }
};
