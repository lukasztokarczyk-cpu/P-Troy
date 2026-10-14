'use client';

import Link from 'next/link';
import { type ProtocolListItem, BAND_STYLES, STATUS_LABELS, STATUS_STYLES, daysLabel, formatDate } from '@/lib/protocols';

export function StatusChip({ status }: { status: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function DeadlineChip({ item }: { item: Pick<ProtocolListItem, 'nextInspectionDate' | 'band' | 'daysToNext' | 'deadlineClosed'> }) {
  if (!item.nextInspectionDate || !item.band) return <span className="text-zinc-600">—</span>;
  if (item.deadlineClosed) return <span className="text-xs text-zinc-500">{formatDate(item.nextInspectionDate)} · zamknięty</span>;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${BAND_STYLES[item.band].chip}`}>
      {formatDate(item.nextInspectionDate)} · {daysLabel(item.daysToNext)}
    </span>
  );
}

/** Tabela na komputerze, karty na telefonie (oba układy są w DOM — przełącza je CSS, więc nie ma migania przy ładowaniu). */
export function ProtocolList({ items, showSite = true }: { items: ProtocolListItem[]; showSite?: boolean }) {
  if (items.length === 0) return <p className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">Brak protokołów.</p>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 md:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2">Numer</th>
              {showSite && <th className="px-3 py-2">Obiekt</th>}
              <th className="px-3 py-2">Typ / badanie</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Wykonawca</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Następne badanie</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800 hover:bg-zinc-900/60" data-testid="protocol-row">
                <td className="px-3 py-2">
                  <Link href={`/protocols/${p.id}`} className="font-medium text-orange-400 hover:underline">{p.number}</Link>
                  {p.isLegacy && <span className="ml-2 text-xs text-zinc-500">stary</span>}
                </td>
                {showSite && (
                  <td className="px-3 py-2 text-zinc-200">
                    {p.siteName || '—'}
                    {p.address && <span className="block text-xs text-zinc-500">{p.address}</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-zinc-300">
                  {p.objectTypeLabel}
                  {p.inspectionKindLabel && <span className="block text-xs text-zinc-500">{p.inspectionKindLabel}</span>}
                </td>
                <td className="px-3 py-2 text-zinc-300">{formatDate(p.performedAt)}</td>
                <td className="px-3 py-2 text-zinc-300">{p.performerName}</td>
                <td className="px-3 py-2"><StatusChip status={p.displayStatus || p.status} /></td>
                <td className="px-3 py-2"><DeadlineChip item={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/protocols/${p.id}`} className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 active:bg-zinc-800" data-testid="protocol-card">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-orange-400">{p.number}</span>
                <StatusChip status={p.displayStatus || p.status} />
              </div>
              {showSite && <p className="mt-1 text-sm text-zinc-200">{p.siteName || '—'}</p>}
              <p className="text-xs text-zinc-500">{[p.objectTypeLabel, p.inspectionKindLabel, formatDate(p.performedAt)].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-zinc-500">{p.performerName}</p>
              {p.nextInspectionDate && <div className="mt-2"><DeadlineChip item={p} /></div>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
