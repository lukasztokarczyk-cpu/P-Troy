'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { TopBar } from '@/components/layout/TopBar';
import { apiClient } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';

/**
 * Layout wspólny dla wszystkich tras panelu (dashboard, harmonogram,
 * zadania, budowy...). Pasek górny renderuje się raz i jest "dostępny
 * z każdego miejsca aplikacji" — zgodnie ze specyfikacją.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiClient<{ isRead: boolean }[]>('/api/notifications?unreadOnly=true')
      .then((list) => setUnreadCount(list.length))
      .catch(() => undefined);
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-graphite-950">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-graphite-950">
      <TopBar notificationCount={unreadCount} />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
