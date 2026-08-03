'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Search, Bell, ChevronDown, LogOut, Settings, User, ShieldCheck, HardHat, CheckCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface TopBarProps {
  notificationCount?: number;
  onNotificationsChanged?: () => void;
}

/**
 * Stały górny pasek — dostępny z każdego miejsca aplikacji (umieszczony
 * w layoutcie grupy tras (dashboard), więc renderuje się raz i utrzymuje
 * stan między nawigacją). Zawiera logo, nazwę firmy, wyszukiwarkę,
 * profil i powiadomienia zgodnie ze specyfikacją.
 */
export function TopBar({ notificationCount = 0, onNotificationsChanged }: TopBarProps) {
  const { user, logout, workMode, setWorkMode } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

  // Ustawienia widoczne wyłącznie gdy admin faktycznie pracuje w trybie
  // Administrator (nie w symulowanym trybie Instalator)
  const isAdminMode = user?.role === 'ADMIN' && workMode === 'ADMIN';

  const toggleNotifications = useCallback(() => {
    setProfileOpen(false);
    setNotifOpen((wasOpen) => {
      const nowOpen = !wasOpen;
      if (nowOpen && notifications === null) {
        setNotifLoading(true);
        apiClient<AppNotification[]>('/api/notifications')
          .then(setNotifications)
          .catch(() => setNotifications([]))
          .finally(() => setNotifLoading(false));
      }
      return nowOpen;
    });
  }, [notifications]);

  const markRead = async (id: string) => {
    setNotifications((list) => list?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? null);
    await apiClient(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => undefined);
    onNotificationsChanged?.();
  };

  const markAllRead = async () => {
    setNotifications((list) => list?.map((n) => ({ ...n, isRead: true })) ?? null);
    await apiClient('/api/notifications/read-all', { method: 'PATCH' }).catch(() => undefined);
    onNotificationsChanged?.();
  };

  const timeAgo = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'przed chwilą';
    if (mins < 60) return `${mins} min temu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} godz. temu`;
    return new Date(iso).toLocaleDateString('pl-PL');
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-zinc-800 bg-graphite-950/90 px-4 backdrop-blur-md md:px-6">
      <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-700">
          <Zap className="h-4 w-4 text-white" fill="white" />
        </div>
        <span className="hidden text-sm font-semibold tracking-tight text-white sm:block">ERP Elektryk</span>
      </Link>

      <div className="relative ml-2 max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          placeholder="Szukaj budów, zadań, produktów..."
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none"
        />
      </div>

      {user?.role === 'ADMIN' && (
        <div className="hidden items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 md:flex" title="Tryb pracy — widok symulowany na froncie, dane w API pozostają administratorskie">
          <button
            onClick={() => setWorkMode('ADMIN')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${workMode === 'ADMIN' ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <ShieldCheck className="h-3 w-3" /> Administrator
          </button>
          <button
            onClick={() => setWorkMode('INSTALATOR')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${workMode === 'INSTALATOR' ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <HardHat className="h-3 w-3" /> Instalator
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            onClick={toggleNotifications}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-orange-500"
          >
            <Bell className="h-4.5 w-4.5" />
            {notificationCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-80 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
                  <span className="text-sm font-semibold text-zinc-200">Powiadomienia</span>
                  {!!notifications?.some((n) => !n.isRead) && (
                    <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300">
                      <CheckCheck className="h-3.5 w-3.5" /> Oznacz wszystkie
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifLoading && <p className="px-3 py-6 text-center text-sm text-zinc-500">Ładowanie…</p>}
                  {!notifLoading && notifications?.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-zinc-500">Brak powiadomień</p>
                  )}
                  {!notifLoading && notifications?.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => !n.isRead && markRead(n.id)}
                      className={`block w-full border-b border-zinc-800 px-3 py-2.5 text-left last:border-0 hover:bg-zinc-800 ${n.isRead ? '' : 'bg-orange-950/20'}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                        <div className={n.isRead ? 'pl-3.5' : ''}>
                          <p className="text-sm font-medium text-zinc-200">{n.title}</p>
                          <p className="text-xs text-zinc-500">{n.message}</p>
                          <p className="mt-0.5 text-[11px] text-zinc-600">{timeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            onClick={() => { setNotifOpen(false); setProfileOpen((v) => !v); }}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-zinc-800"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600/20 text-xs font-semibold text-orange-400">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <span className="hidden text-sm text-zinc-200 md:block">{user?.firstName} {user?.lastName}</span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-zinc-500 md:block" />
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-52 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl"
              >
                {user?.role === 'ADMIN' && (
                  <div className="flex gap-1 border-b border-zinc-800 p-2 md:hidden">
                    <button
                      onClick={() => setWorkMode('ADMIN')}
                      className={`flex-1 rounded-md py-1.5 text-xs font-medium ${workMode === 'ADMIN' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                    >
                      Administrator
                    </button>
                    <button
                      onClick={() => setWorkMode('INSTALATOR')}
                      className={`flex-1 rounded-md py-1.5 text-xs font-medium ${workMode === 'INSTALATOR' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                    >
                      Instalator
                    </button>
                  </div>
                )}
                <Link href="/profile" className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">
                  <User className="h-4 w-4" /> Mój profil
                </Link>
                {isAdminMode && (
                  <Link href="/settings" className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">
                    <Settings className="h-4 w-4" /> Ustawienia
                  </Link>
                )}
                <button
                  onClick={() => logout()}
                  className="flex w-full items-center gap-2 border-t border-zinc-800 px-3 py-2.5 text-sm text-red-400 hover:bg-zinc-800"
                >
                  <LogOut className="h-4 w-4" /> Wyloguj się
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
