'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { TileGrid, DashboardTile } from '@/components/layout/TileGrid';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, isPrivileged } = useAuth();
  const [tiles, setTiles] = useState<DashboardTile[] | null>(null);

  useEffect(() => {
    apiClient<DashboardTile[]>('/api/tiles/mine').then((fetched) => {
      // "Ustawienia" — widoczne wyłącznie dla administratora. Backend
      // i tak blokuje dostęp do samego API dla innych ról; to tylko
      // ukrycie kafelka z widoku, żeby nie zapraszać do klikania.
      let visible = fetched.filter((t) => t.key !== 'settings' || user?.role === 'ADMIN');

      // Kafelek "Użytkownicy" (zarządzanie kontami, w tym tworzenie
      // kont instalatorów) — dodawany tylko dla admina, niezależnie od
      // konfiguracji kafelków w bazie (żeby nie wymagać osobnego seeda)
      if (user?.role === 'ADMIN') {
        visible = [
          ...visible,
          {
            id: 'users-tile',
            key: 'users',
            name: 'Użytkownicy',
            description: 'Zarządzanie kontami',
            icon: 'Users',
            route: '/users',
            color: '#f97316',
            notificationCount: 0,
          } as DashboardTile,
        ];
      }

      setTiles(visible);
    }).catch(() => setTiles([]));
  }, [user]);

  const handleReorder = (orderedIds: string[]) => {
    if (!isPrivileged) return;
    apiClient('/api/tiles/reorder/apply', { method: 'PATCH', body: { orderedIds } }).catch(() => undefined);
  };

  return (
    <div className="animate-fade-in">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-xl font-semibold text-white">
          Witaj, {user?.firstName} 👋
        </h1>
        <p className="text-sm text-zinc-500">Wybierz moduł, z którym chcesz dziś pracować.</p>
      </motion.div>

      {tiles === null ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : (
        <TileGrid tiles={tiles} isAdmin={isPrivileged} onReorder={handleReorder} />
      )}
    </div>
  );
}
