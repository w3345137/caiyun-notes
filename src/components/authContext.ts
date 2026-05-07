import { createContext, useContext } from 'react';

export interface User {
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

export const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);
