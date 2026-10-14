'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, List, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { BAND_STYLES, type DeadlineBand, daysLabel, errorMessage, formatDate, todayYmd } from '@/lib/protocols';

interface Deadline {
  id: string;
  number: string;
  siteId: string | null;
  siteName: string;
  address: string;
  objectTypeLabel: string;
  inspectionKindLabel: string;
  performerName: string;
  nextInspectionDate: string;
  daysToNext: number;
  band: DeadlineBand;
  closed: boolean;
}

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Terminy badań: lista (domyślnie) i kalendarz miesięczny. Kolory z jednego miejsca (BAND_STYLES). */
export function DeadlinesView() {
  const [items, setItems] = useState<Deadline[] | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'list' | 'calendar'>('list');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [month, setMonth] = useState(() => {
    const t = todayYmd();
    return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 };
  });

  useEffect(() => {
    setItems(null);
    apiClient<Deadline[]>(`/api/protocols/deadlines${includeClosed ? '?includeClosed=1' : ''}`)
      .then(setItems)
      .catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [includeClosed]);

  const byDate = useMemo(() => {
    const m = new Map<string, Deadline[]>();
    for (const d of items ?? []) {
      const l = m.get(d.nextInspectionDate) ?? [];
      l.push(d);
      m.set(d.nextInspectionDate, l);
    }
    return m;
  }, [items]);

  if (items === null) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>;

  // Siatka miesiąca (poniedziałek = pierwszy dzień tygodnia)
  const first = new Date(Date.UTC(month.y, month.m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const shiftMonth = (d: number) => setMonth((cur) => { const n = new Date(Date.UTC(cur.y, cur.m + d, 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() }; });

  return (
    <div data-testid="deadlines">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(BAND_STYLES) as DeadlineBand[]).reverse().map((b) => (
            <span key={b} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${BAND_STYLES[b].chip}`}>
              <span className={`h-2 w-2 rounded-full ${BAND_STYLES[b].dot}`} />{BAND_STYLES[b].label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" className="accent-orange-600" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} /> Pokaż zamknięte
          </label>
          <div className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
            <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')} className={`flex min-h-[44px] items-center gap-1 px-3 text-sm ${mode === 'list' ? 'bg-orange-600 text-white' : 'text-zinc-300'}`}><List className="h-4 w-4" />Lista</button>
            <button type="button" aria-pressed={mode === 'calendar'} onClick={() => setMode('calendar')} className={`flex min-h-[44px] items-center gap-1 px-3 text-sm ${mode === 'calendar' ? 'bg-orange-600 text-white' : 'text-zinc-300'}`}><CalendarDays className="h-4 w-4" />Kalendarz</button>
          </div>
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}

      {mode === 'list' ? (
        items.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">Brak terminów — pojawią się po zatwierdzeniu protokołu z ustawionym terminem następnego badania.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((d) => (
              <li key={d.id}>
                <Link href={`/protocols/${d.id}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${BAND_STYLES[d.band].cell} ${d.closed ? 'opacity-60' : ''}`} data-testid="deadline-item">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{d.siteName || '—'} <span className="text-zinc-500">· {d.number}</span></p>
                    <p className="truncate text-xs text-zinc-500">{[d.address, d.objectTypeLabel, d.performerName].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-zinc-100">{formatDate(d.nextInspectionDate)}</p>
                    <p className={`text-xs ${d.closed ? 'text-zinc-500' : ''}`}>{d.closed ? 'zamknięty' : daysLabel(d.daysToNext)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Poprzedni miesiąc" onClick={() => shiftMonth(-1)} className="rounded-lg p-3 hover:bg-zinc-800"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-medium capitalize text-zinc-100">{MONTHS[month.m]} {month.y}</span>
            <button type="button" aria-label="Następny miesiąc" onClick={() => shiftMonth(1)} className="rounded-lg p-3 hover:bg-zinc-800"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const ymd = `${month.y}-${pad(month.m + 1)}-${pad(day)}`;
              const list = byDate.get(ymd) ?? [];
              return (
                <div key={i} className="min-h-[64px] rounded-lg border border-zinc-800 p-1 text-left" data-testid="cal-day">
                  <span className="text-[11px] text-zinc-500">{day}</span>
                  {list.map((d) => (
                    <Link key={d.id} href={`/protocols/${d.id}`} title={`${d.siteName} · ${d.number}`} className={`mt-0.5 block truncate rounded border px-1 text-[10px] ${BAND_STYLES[d.band].cell} text-zinc-100`}>
                      {d.siteName || d.number}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
