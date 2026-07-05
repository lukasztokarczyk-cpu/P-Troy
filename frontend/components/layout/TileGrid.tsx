'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, Reorder } from 'framer-motion';
import * as Icons from 'lucide-react';
import { GripVertical, ArrowDownUp, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DashboardTile {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  icon: string;
  route: string;
  color: string;
  notificationCount?: number;
}

interface TileGridProps {
  tiles: DashboardTile[];
  isAdmin: boolean;
  onReorder?: (orderedIds: string[]) => void;
}

/**
 * Dashboard złożony z dużych kafelków. Drag & Drop do zmiany kolejności
 * jest dostępny wyłącznie dla administratora i WYŁĄCZNIE po explicit
 * włączeniu trybu edycji (przycisk "Zmień kolejność") — domyślnie
 * kafelki są statyczne (zwykłe linki, bez <Reorder.Group>).
 *
 * To jest celowe: <Reorder.Group> zawsze aktywny interpretowałby
 * zwykłe przewijanie ekranu na telefonie jako gest przeciągania,
 * powodując losowe "rozjeżdżanie się" kafelków przy samym scrollowaniu.
 * Tryb edycji eliminuje ten problem — poza nim kafelki się nie ruszają.
 */
export function TileGrid({ tiles, isAdmin, onReorder }: TileGridProps) {
  const [items, setItems] = useState(tiles);
  const [editMode, setEditMode] = useState(false);

  const handleReorder = (newItems: DashboardTile[]) => {
    setItems(newItems);
  };

  const finishEditing = () => {
    setEditMode(false);
    onReorder?.(items.map((t) => t.id));
  };

  if (!isAdmin || !editMode) {
    return (
      <div>
        {isAdmin && (
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="border-zinc-700 text-zinc-300">
              <ArrowDownUp className="mr-1.5 h-3.5 w-3.5" /> Zmień kolejność
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((tile) => (
            <TileCard key={tile.id} tile={tile} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-orange-600/40 bg-orange-950/20 px-3 py-2">
        <span className="text-xs text-orange-300">Tryb edycji — przytrzymaj i przesuń kafelek, aby zmienić kolejność.</span>
        <Button size="sm" onClick={finishEditing} className="bg-orange-600 text-white hover:bg-orange-500">
          <Check className="mr-1.5 h-3.5 w-3.5" /> Gotowe
        </Button>
      </div>
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={handleReorder}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {items.map((tile) => (
          <Reorder.Item key={tile.id} value={tile} className="list-none">
            <TileCard tile={tile} draggable />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}

function TileCard({ tile, draggable }: { tile: DashboardTile; draggable?: boolean }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[tile.icon] || Icons.LayoutGrid;

  const content = (
    <div className="group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-md transition-colors hover:border-orange-600/50">
      {/* Poświata akcentu, widoczna na hover */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-30"
        style={{ backgroundColor: tile.color }}
      />

      {draggable && (
        <GripVertical className="absolute right-2 top-2 h-4 w-4 cursor-grab text-zinc-700 active:cursor-grabbing" />
      )}

      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tile.color}22` }}
      >
        <Icon className="h-5.5 w-5.5" style={{ color: tile.color }} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-100">{tile.name}</h3>
        {tile.description && <p className="mt-0.5 truncate text-xs text-zinc-500">{tile.description}</p>}
      </div>

      {!!tile.notificationCount && (
        <span className="absolute right-4 top-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1.5 text-[10px] font-bold text-white">
          {tile.notificationCount > 99 ? '99+' : tile.notificationCount}
        </span>
      )}
    </div>
  );

  // W trybie edycji kafelek NIE jest linkiem (żeby dotknięcie w celu
  // przeciągnięcia nie nawigowało przypadkowo do innej strony)
  if (draggable) {
    return (
      <motion.div whileTap={{ scale: 0.97 }}>
        {content}
      </motion.div>
    );
  }

  return (
    <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      <Link href={tile.route}>{content}</Link>
    </motion.div>
  );
}
