import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, onAuthStateChange, getCurrentUserId, getCurrentUserEmail, supabase } from '../lib/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // 优先使用同步缓存的用户 ID，避免页面闪烁
  const cachedId = getCurrentUserId();
  const cachedEmail = getCurrentUserEmail();

  const [user, setUser] = useState<User | null>(
    cachedId && cachedEmail
      ? {
          id: cachedId,
          email: cachedEmail,
          display_name: cachedEmail.split('@')[0],
        }
      : null
  );
  // 初始为 false，因为我们已经从缓存同步获取了用户
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 订阅认证状态变化
    const { data: { subscription } } = onAuthStateChange(async (authUser) => {
      console.log('[AuthProvider] onAuthStateChange:', authUser?.id);
      if (!authUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // 优先用 Supabase API 获取最新用户数据（包含完整的 user_metadata）
      const { data: freshUser } = await supabase.auth.getUser();
      const meta = freshUser?.user?.user_metadata as any;
      const displayName = meta?.display_name || meta?.full_name || authUser.display_name || authUser.email.split('@')[0];
      const normalizedUser: User = {
        id: authUser.id,
        email: authUser.email,
        display_name: displayName,
        user_metadata: authUser.user_metadata,
      };
      console.log('[AuthProvider] display_name from API:', displayName);
      setUser(normalizedUser);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
