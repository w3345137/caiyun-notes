import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getCurrentUserId, getCurrentUserEmail, getCurrentUsername } from '../lib/auth';

interface User {
  id: string;
  email: string;
  display_name?: string;
  username?: string;
  user_metadata?: { display_name?: string };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      console.log('[AuthProvider] 初始化本地认证...');
      const id = getCurrentUserId();
      const email = getCurrentUserEmail();
      const username = getCurrentUsername();
      
      if (id && email) {
        console.log('[AuthProvider] 发现有效本地用户:', email, '昵称:', username);
        setUser({ id, email, display_name: username || email.split('@')[0], username, user_metadata: { display_name: username || email.split('@')[0] } });
      } else {
        console.log('[AuthProvider] 未找到本地登录状态');
      }
      setLoading(false);
    }
    initAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
