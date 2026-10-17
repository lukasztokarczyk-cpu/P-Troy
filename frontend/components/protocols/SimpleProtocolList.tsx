'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/protocols';
import type { SimpleProtocolListItem } from '@/lib/simple-protocols';

/** Lista protokołów prostych: tabela na komputerze, karty na telefonie. */
export function SimpleProtocolList({ items, showSite = true }: { items: SimpleProtocolListItem[]; showSite?: boolean }) {
  if (items.length === 0) return <p className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">Brak protokołów prostych.</p>;
  return (
    <div data-testid="simple-list">
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 md:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2">Numer</th><th className="px-3 py-2">Nazwa</th>
              {showSite && <th className="px-3 py-2">Budynek</th>}
              <th className="px-3 py-2">Data</th><th className="px-3 py-2">Wykonał</th><th className="px-3 py-2">Elementy</th><th className="px-3 py-2">Zdjęcia</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800 hover:bg-zinc-900/60" data-testid="simple-row">
                <td className="px-3 py-2"><Link href={`/protocols/simple/${p.id}`} className="font-medium text-orange-400 hover:underline">{p.number}</Link></td>
                <td className="px-3 py-2 text-zinc-200">{p.name}</td>
                {showSite && <td className="px-3 py-2 text-zinc-200">{p.siteName || '—'}{p.address && <span className="block text-xs text-zinc-500">{p.address}</span>}</td>}
                <td className="px-3 py-2 text-zinc-300">{formatDate(p.performedAt)}</td>
                <td className="px-3 py-2 text-zinc-300">{p.authorName}</td>
                <td className="px-3 py-2 text-zinc-300">{p.itemCount}</td>
                <td className="px-3 py-2 text-zinc-300">{p.photoCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {items.map((p) => (
          <Link key={p.id} href={`/protocols/simple/${p.id}`} className="block rounded-xl border border-zinc-800 p-3 hover:bg-zinc-900/60" data-testid="simple-card">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-orange-400">{p.number}</span><span className="text-xs text-zinc-500">{formatDate(p.performedAt)}</span></div>
            <p className="mt-1 text-sm text-zinc-100">{p.name}</p>
            {showSite && <p className="text-xs text-zinc-400">{p.siteName}{p.address ? ` — ${p.address}` : ''}</p>}
            <p className="mt-1 text-xs text-zinc-500">{p.authorName} · elementów: {p.itemCount} · zdjęć: {p.photoCount}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
