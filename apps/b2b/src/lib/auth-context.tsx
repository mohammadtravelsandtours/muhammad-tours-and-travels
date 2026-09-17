'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AuthResponse } from './api-client';

// Same session-storage caveat as apps/admin/src/lib/auth-context.tsx.
interface AuthState {
  user: AuthResponse['user'] | null;
  accessToken: string | null;
  loading: boolean;
  setSession: (s: AuthResponse) => void;
  logout: () => void;
}
const AuthContext = createContext<AuthState | undefined>(undefined);
const STORAGE_KEY = 'mt-b2b-session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthResponse['user'] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AuthResponse;
        setUser(parsed.user); setAccessToken(parsed.accessToken);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const setSession = (s: AuthResponse) => {
    setUser(s.user); setAccessToken(s.accessToken);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };
  const logout = () => { setUser(null); setAccessToken(null); sessionStorage.removeItem(STORAGE_KEY); };

  const value = useMemo(() => ({ user, accessToken, loading, setSession, logout }), [user, accessToken, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
