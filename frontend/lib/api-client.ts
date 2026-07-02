'use client';

/**
 * Cienki klient HTTP wykorzystywany przez cały frontend. Automatycznie
 * dołącza access token, a po otrzymaniu 401 próbuje odświeżyć sesję
 * przez /api/auth/refresh (refresh token jest w httpOnly cookie, więc
 * nie jest tu w ogóle widoczny dla JS) i ponawia oryginalne żądanie.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let accessToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh_failed');
        const data = await res.json();
        setAccessToken(data.accessToken);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  skipAuthRetry?: boolean;
}

export async function apiClient<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

  let response = await doFetch();

  if (response.status === 401 && !options.skipAuthRetry) {
    try {
      await refreshAccessToken();
      response = await doFetch();
    } catch {
      // Sesja niemożliwa do odświeżenia — wywołujący (AuthContext) przekieruje do logowania
      throw new Error('unauthorized');
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorBody.message || 'Wystąpił błąd żądania');
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export { API_URL };
