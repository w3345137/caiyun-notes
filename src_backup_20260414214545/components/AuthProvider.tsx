import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../lib/api';

interface User { id: string; email: string; }
interface AuthContextType { user: User | null; loading: boolean; logout: () => void; }

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, logout: () => {} });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      console.log('[AuthProvider] 初始化检查登录状态...');
      try {
        const u = await api.getUser();
        if (u) {
          console.log('[AuthProvider] 发现有效用户:', u.email);
          setUser(u);
        } else {
          console.log('[AuthProvider] 未登录');
        }
      } catch (e) {
        console.error('[AuthProvider] 初始化失败:', e);
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  const logout = async () => {
    console.log('[AuthProvider] 用户手动登出');
    await api.logout();
    setUser(null);
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
