'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, setAccessToken } from './api-client';

export type Role = 'ADMIN' | 'KIEROWNIK' | 'INSTALATOR' | 'MAGAZYNIER';

export interface CurrentUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isPrivileged: boolean;
  login: (login: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Przy pierwszym renderze próbujemy odświeżyć sesję z httpOnly cookie —
  // jeśli się uda, użytkownik zostaje zalogowany bez ponownego wpisywania hasła
  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient<{ accessToken: string }>('/api/auth/refresh', { method: 'POST' });
        setAccessToken(data.accessToken);
        // Access token nie zawiera danych profilu — pobieramy je osobno
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
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    await apiClient('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'KIEROWNIK';

  return (
    <AuthContext.Provider value={{ user, isLoading, isPrivileged, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth musi być użyty wewnątrz <AuthProvider>');
  return ctx;
}
