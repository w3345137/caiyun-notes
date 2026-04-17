/**
 * 快乐云笔记 - API客户端
 * 连接自建后端数据库
 * 使用相对路径，通过Nginx代理访问
 *
 * ⚠️ [已废弃] 此文件已不再使用，当前统一使用 Supabase（见 initDatabase.ts）
 * 此文件保留用于参考自建后端 API 协议，不参与任何业务逻辑
 * @deprecated
 */

const API_BASE = '/api';

// 认证状态变化回调
type AuthCallback = (user: any) => void;
let authCallbacks: AuthCallback[] = [];

// 通知所有认证监听器
function notifyAuthCallbacks(user: any) {
  authCallbacks.forEach(cb => cb(user));
}

// 注册认证状态监听器
export function onAuthStateChange(callback: AuthCallback) {
  authCallbacks.push(callback);
  return {
    unsubscribe: () => {
      authCallbacks = authCallbacks.filter(cb => cb !== callback);
    }
  };
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

class ApiClient {
  private token: string | null = null;
  private user: any = null;

  // 保存token到本地
  private saveAuth() {
    if (this.token && this.user) {
      localStorage.setItem('cloudnote_token', this.token);
      localStorage.setItem('cloudnote_user', JSON.stringify(this.user));
    }
  }

  // 加载保存的认证
  private loadAuth() {
    const token = localStorage.getItem('cloudnote_token');
    const userStr = localStorage.getItem('cloudnote_user');
    if (token && userStr) {
      this.token = token;
      this.user = JSON.parse(userStr);
      return true;
    }
    return false;
  }

  // 获取请求头
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  // 通用请求方法
  private async request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error || '请求失败' };
      }

      return { data };
    } catch (error) {
      return { error: '网络错误，请检查服务器连接' };
    }
  }

  // ============== 认证相关 ==============

  // 注册
  async register(email: string, password: string, displayName?: string): Promise<boolean> {
    const result = await this.request<{ user: any; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    });

    if (result.data) {
      this.token = result.data.token;
      this.user = result.data.user;
      this.saveAuth();
      notifyAuthCallbacks(this.user);
      return true;
    }
    return false;
  }

  // 登录
  async login(email: string, password: string): Promise<boolean> {
    const result = await this.request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (result.data) {
      this.token = result.data.token;
      this.user = result.data.user;
      this.saveAuth();
      notifyAuthCallbacks(this.user);
      return true;
    }
    return false;
  }

  // 登出
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('cloudnote_token');
    localStorage.removeItem('cloudnote_user');
    notifyAuthCallbacks(null);
  }

  // 获取当前用户
  async getMe(): Promise<any> {
    const result = await this.request<{ user: any }>('/auth/me');
    if (result.data) {
      this.user = result.data.user;
      this.saveAuth();
      return result.data.user;
    }
    return null;
  }

  // 检查是否已登录
  isAuthenticated(): boolean {
    if (!this.token) {
      return this.loadAuth();
    }
    return true;
  }

  // 获取用户信息
  getUser(): any {
    if (!this.user) {
      this.loadAuth();
    }
    return this.user;
  }

  // 获取用户ID
  getUserId(): string | null {
    return this.user?.id || null;
  }

  // ============== 笔记相关 ==============

  // 获取所有笔记
  async getNotes(): Promise<any[]> {
    const result = await this.request<{ notes: any[] }>('/notes');
    if (result.data?.notes) {
      return result.data.notes.map((note: any) => ({
        id: note.id,
        title: note.title,
        content: note.content || '',
        parentId: note.parent_id,
        type: note.type,
        userId: note.user_id,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
        order: note.order_index,
        icon: note.icon || 'doc',
        lockedBy: note.locked_by,
        lockedByName: note.locked_by_name,
      }));
    }
    return [];
  }

  // 同步笔记到云端
  async syncNotes(notes: any[]): Promise<boolean> {
    const apiNotes = notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content || '',
      parentId: note.parentId,
      type: note.type,
      order: note.order,
      icon: note.icon || 'doc',
      lockedBy: note.lockedBy,
      lockedByName: note.lockedByName,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    }));

    const result = await this.request<{ success: boolean }>('/notes/sync', {
      method: 'POST',
      body: JSON.stringify({ notes: apiNotes }),
    });

    return result.data?.success || false;
  }

  // 删除笔记
  async deleteNote(noteId: string): Promise<boolean> {
    const result = await this.request<{ success: boolean }>(`/notes/${noteId}`, {
      method: 'DELETE',
    });
    return result.data?.success || false;
  }

  // ============== 共享相关 ==============

  // 获取共享列表
  async getShares(notebookId: string): Promise<any[]> {
    const result = await this.request<{ shares: any[] }>(`/shares/${notebookId}`);
    if (result.data?.shares) {
      return result.data.shares;
    }
    return [];
  }

  // 添加共享
  async addShare(notebookId: string, email: string, permission: 'view' | 'edit' = 'view'): Promise<boolean> {
    const result = await this.request<{ share: any }>('/shares', {
      method: 'POST',
      body: JSON.stringify({ notebookId, email, permission }),
    });
    return !!result.data?.share;
  }

  // 删除共享
  async deleteShare(shareId: string): Promise<boolean> {
    const result = await this.request<{ success: boolean }>(`/shares/${shareId}`, {
      method: 'DELETE',
    });
    return result.data?.success || false;
  }
}

export const apiClient = new ApiClient();
