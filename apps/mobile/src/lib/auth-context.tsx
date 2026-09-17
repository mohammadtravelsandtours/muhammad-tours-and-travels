import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { AuthResponse } from './api-client';
import { clearStoredSession, readStoredSession, writeStoredSession } from './storage';

// Same shape/contract as apps/web's and apps/admin's auth-context — only
// the persistence layer changes (AsyncStorage here vs. sessionStorage on
// web), so a screen written against `useAuth()` reads identically to its
// web counterpart.
interface AuthState {
  user: AuthResponse['user'] | null;
  accessToken: string | null;
  loading: boolean;
  setSession: (session: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthResponse['user'] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readStoredSession<AuthResponse>().then((session) => {
      if (session) {
        setUser(session.user);
        setAccessToken(session.accessToken);
      }
      setLoading(false);
    });
  }, []);

  const setSession = (session: AuthResponse) => {
    setUser(session.user);
    setAccessToken(session.accessToken);
    writeStoredSession(session);
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    clearStoredSession();
  };

  const value = useMemo(() => ({ user, accessToken, loading, setSession, logout }), [user, accessToken, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
