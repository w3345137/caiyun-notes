import { useEffect, useState, ReactNode } from 'react';
import { getCurrentUserId, getCurrentUserEmail, getCurrentUsername } from '../lib/auth';
import { AuthContext, User } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      const id = getCurrentUserId();
      const email = getCurrentUserEmail();
      const username = getCurrentUsername();
      
      if (id && email) {
        setUser({ id, email, display_name: username || email.split('@')[0], username, user_metadata: { display_name: username || email.split('@')[0] } });
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
