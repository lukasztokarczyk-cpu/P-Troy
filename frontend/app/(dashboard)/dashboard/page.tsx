'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { TileGrid, DashboardTile } from '@/components/layout/TileGrid';
import { Loader2 } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator', KIEROWNIK: 'Brygadzista', INSTALATOR: 'Instalator', MAGAZYNIER: 'Magazynier',
};

export default function DashboardPage() {
  const { user, isPrivileged, workMode } = useAuth();
  const [tiles, setTiles] = useState<DashboardTile[] | null>(null);

  // Prawdziwy tryb administratora — inaczej niż isPrivileged (który
  // obejmuje też Brygadzistę), Ustawienia i Użytkownicy są tylko dla
  // ADMIN pracującego w trybie Administrator (nie w symulowanym "Instalator")
  const isAdminMode = user?.role === 'ADMIN' && workMode === 'ADMIN';

  // Gdy administrator korzysta z trybu podglądu "jako Instalator", realna
  // rola w bazie (user.role) się nie zmienia — pokazujemy więc etykietę
  // symulowanego trybu, żeby było jasne że to tylko podgląd frontendowy,
  // a nie realna zmiana uprawnień (patrz decyzje projektowe, sekcja 4).
  const isSimulating = user?.role === 'ADMIN' && workMode === 'INSTALATOR';
  const roleLabel = isSimulating ? ROLE_LABELS.INSTALATOR : ROLE_LABELS[user?.role ?? ''] ?? user?.role;

  useEffect(() => {
    apiClient<DashboardTile[]>('/api/tiles/mine').then((fetched) => {
      // "Ustawienia" — widoczne wyłącznie dla administratora. Backend
      // i tak blokuje dostęp do samego API dla innych ról; to tylko
      // ukrycie kafelka z widoku, żeby nie zapraszać do klikania.
      let visible = fetched.filter((t) => t.key !== 'settings' || isAdminMode);

      // "Notatki i wydatki" — dostępne dla każdej roli (każdy może
      // zgłosić tankowanie/zakup/koszt), dodawane tak samo jak
      // Użytkownicy, niezależnie od konfiguracji kafelków w bazie
      visible = [
        ...visible,
        {
          id: 'expenses-tile',
          key: 'expenses',
          name: 'Notatki i wydatki',
          description: 'Tankowania, zakupy, koszty',
          icon: 'Receipt',
          route: '/expenses',
          color: '#f97316',
          notificationCount: 0,
        } as DashboardTile,
        {
          id: 'failures-tile',
          key: 'failures',
          name: 'Awarie',
          description: 'Zgłoszenia usterek',
          icon: 'AlertTriangle',
          route: '/failures',
          color: '#f97316',
          notificationCount: 0,
        } as DashboardTile,
        {
          id: 'messages-tile',
          key: 'messages',
          name: 'Komunikator',
          description: 'Wiadomości wewnętrzne',
          icon: 'MessageSquare',
          route: '/messages',
          color: '#f97316',
          notificationCount: 0,
        } as DashboardTile,
      ];

      // Kafelek "Użytkownicy" (zarządzanie kontami, w tym tworzenie
      // kont instalatorów) — dodawany tylko dla admina, niezależnie od
      // konfiguracji kafelków w bazie (żeby nie wymagać osobnego seeda)
      if (isAdminMode) {
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
  }, [user, isAdminMode]);

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
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm text-zinc-500">Wybierz moduł, z którym chcesz dziś pracować.</p>
          <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
            {roleLabel}
          </span>
          {isSimulating && (
            <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
              podgląd — realna rola: Administrator
            </span>
          )}
        </div>
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
