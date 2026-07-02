'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, Reorder } from 'framer-motion';
import * as Icons from 'lucide-react';
import { GripVertical } from 'lucide-react';

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
 * Dashboard złożony z dużych kafelków — ikona, nazwa, licznik
 * powiadomień, animacja po najechaniu. Administrator może dodatkowo
 * zmieniać kolejność metodą Drag & Drop (framer-motion <Reorder>).
 */
export function TileGrid({ tiles, isAdmin, onReorder }: TileGridProps) {
  const [items, setItems] = useState(tiles);

  const handleReorder = (newItems: DashboardTile[]) => {
    setItems(newItems);
    onReorder?.(newItems.map((t) => t.id));
  };

  if (!isAdmin) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((tile) => (
          <TileCard key={tile.id} tile={tile} />
        ))}
      </div>
    );
  }

  return (
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
  );
}

function TileCard({ tile, draggable }: { tile: DashboardTile; draggable?: boolean }) {
  const Icon = (Icons as Record<string, Icons.LucideIcon>)[tile.icon] || Icons.LayoutGrid;

  return (
    <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      <Link
        href={tile.route}
        className="group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-md transition-colors hover:border-orange-600/50"
      >
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
      </Link>
    </motion.div>
  );
}
