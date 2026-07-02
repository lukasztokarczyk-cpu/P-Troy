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
    apiClient<DashboardTile[]>('/api/tiles/mine').then(setTiles).catch(() => setTiles([]));
  }, []);

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
