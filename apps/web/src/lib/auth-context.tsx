'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AuthResponse } from './api-client';

// See apps/admin/src/lib/auth-context.tsx for the session-storage
// caveat that applies equally here — same pattern, same hardening note.
interface AuthState {
  user: AuthResponse['user'] | null;
  accessToken: string | null;
  loading: boolean;
  setSession: (session: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const STORAGE_KEY = 'mt-web-session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthResponse['user'] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AuthResponse;
        setUser(parsed.user);
        setAccessToken(parsed.accessToken);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const setSession = (session: AuthResponse) => {
    setUser(session.user);
    setAccessToken(session.accessToken);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(() => ({ user, accessToken, loading, setSession, logout }), [user, accessToken, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
