'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient, LoginResponse, TwoFactorChallenge } from './api-client';

/**
 * Phase 1 note: the access token is kept in memory + sessionStorage so a
 * page refresh doesn't immediately log the operator out during
 * development. This is a foundation-stage simplification, not the
 * production posture — before Phase 4 ships to real customers, the
 * refresh token should move to an httpOnly, Secure, SameSite cookie set
 * by the API (not readable by JS at all), with CSRF protection added
 * alongside it. Tracked as a hardening item, not silently glossed over.
 */
interface AuthState {
  user: LoginResponse['user'] | null;
  accessToken: string | null;
  loading: boolean;
  /** Resolves normally once fully signed in. If the account has 2FA enabled, resolves to a challenge instead of setting a session — call completeTwoFactorLogin with it next. */
  login: (email: string, password: string) => Promise<TwoFactorChallenge | void>;
  completeTwoFactorLogin: (twoFactorToken: string, code: string) => Promise<void>;
  logout: () => void;
}

function assertAdminAccess(result: LoginResponse): LoginResponse {
  if (!result.user.roles.some((r) => ['SUPER_ADMIN', 'OPS_SUPPORT', 'FINANCE'].includes(r))) {
    throw new Error('This account does not have access to the admin console.');
  }
  return result;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const STORAGE_KEY = 'mt-admin-session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { user: LoginResponse['user']; accessToken: string };
        setUser(parsed.user);
        setAccessToken(parsed.accessToken);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const applySession = (result: LoginResponse) => {
    setUser(result.user);
    setAccessToken(result.accessToken);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: result.user, accessToken: result.accessToken }));
  };

  const login = async (email: string, password: string) => {
    const result = await apiClient.login(email, password);
    if ('twoFactorRequired' in result) return result;
    applySession(assertAdminAccess(result));
  };

  const completeTwoFactorLogin = async (twoFactorToken: string, code: string) => {
    const result = await apiClient.verifyTwoFactor(twoFactorToken, code);
    applySession(assertAdminAccess(result));
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({ user, accessToken, loading, login, completeTwoFactorLogin, logout }),
    [user, accessToken, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
