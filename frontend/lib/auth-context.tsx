'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, setAccessToken } from './api-client';

export type Role = 'ADMIN' | 'KIEROWNIK' | 'INSTALATOR' | 'MAGAZYNIER';
export type WorkMode = 'ADMIN' | 'INSTALATOR';

export interface CurrentUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatarUrl?: string;
  termsAcceptedAt?: string | null;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isPrivileged: boolean;
  workMode: WorkMode;
  setWorkMode: (mode: WorkMode) => void;
  login: (login: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workMode, setWorkModeState] = useState<WorkMode>('ADMIN');
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient<{ accessToken: string }>('/api/auth/refresh', { method: 'POST' });
        setAccessToken(data.accessToken);
        const me = await apiClient<CurrentUser>('/api/users/me').catch(() => null);
        if (me) setUser(me);
      } catch {
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (loginValue: string, password: string, rememberMe: boolean) => {
    const data = await apiClient<{ accessToken: string; user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: { login: loginValue, password, rememberMe },
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setWorkModeState('ADMIN');
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    await apiClient('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const setWorkMode = useCallback((mode: WorkMode) => {
    if (user?.role !== 'ADMIN') return;
    setWorkModeState(mode);
  }, [user]);

  const refreshUser = useCallback(async () => {
    const me = await apiClient<CurrentUser>('/api/users/me').catch(() => null);
    if (me) setUser(me);
  }, []);

  const effectiveRole: Role | undefined = user?.role === 'ADMIN' && workMode === 'INSTALATOR' ? 'INSTALATOR' : user?.role;
  const isPrivileged = effectiveRole === 'ADMIN' || effectiveRole === 'KIEROWNIK';

  return (
    <AuthContext.Provider value={{ user, isLoading, isPrivileged, workMode, setWorkMode, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth musi być użyty wewnątrz <AuthProvider>');
  return ctx;
}
