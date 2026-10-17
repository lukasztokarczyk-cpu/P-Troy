'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { OBJECT_TYPE_OPTIONS, STATUS_LABELS, type ProtocolListItem, errorMessage } from '@/lib/protocols';
import { ProtocolList } from '@/components/protocols/ProtocolList';
import { DeadlinesView } from '@/components/protocols/DeadlinesView';
import { NewProtocolChooser } from '@/components/protocols/NewProtocolChooser';
import { SimpleProtocolList } from '@/components/protocols/SimpleProtocolList';
import type { SimpleProtocolListItem } from '@/lib/simple-protocols';
import { fieldClass } from '@/components/ui/modal';

const STATUS_FILTERS = ['DRAFT', 'TODO', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FIXES', 'OVERDUE'];

export default function ProtocolsPage() {
  const { isPrivileged } = useAuth();
  const [tab, setTab] = useState<'list' | 'simple' | 'deadlines'>('list');
  const [items, setItems] = useState<ProtocolListItem[] | null>(null);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(false);
  const [simple, setSimple] = useState<SimpleProtocolListItem[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [objectType, setObjectType] = useState('');
  const [performers, setPerformers] = useState<{ id: string; name: string }[]>([]);
  const [performerId, setPerformerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    // „Po terminie” jest statusem wyliczanym — filtrujemy po stronie klienta
    if (status && status !== 'OVERDUE') qs.set('status', status);
    if (objectType) qs.set('objectType', objectType);
    if (performerId) qs.set('performerId', performerId);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    setError('');
    apiClient<ProtocolListItem[]>(`/api/protocols?${qs}`)
      .then((l) => setItems(status === 'OVERDUE' ? l.filter((p) => p.displayStatus === 'OVERDUE') : l))
      .catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [q, status, objectType, performerId, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (tab !== 'simple') return;
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    const t = setTimeout(() => {
      apiClient<SimpleProtocolListItem[]>(`/api/simple-protocols?${qs}`).then(setSimple).catch((e) => { setSimple([]); setError(errorMessage(e)); });
    }, 250);
    return () => clearTimeout(t);
  }, [tab, q, dateFrom, dateTo]);

  useEffect(() => {
    if (isPrivileged) apiClient<{ id: string; name: string }[]>('/api/protocols/performers').then(setPerformers).catch(() => setPerformers([]));
  }, [isPrivileged]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Protokoły</h1>
        <Button onClick={() => setWizard(true)}><Plus className="mr-2 h-4 w-4" />Nowy protokół</Button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-zinc-800" role="tablist">
        {([['list', 'Protokoły'], ['simple', 'Protokoły proste'], ['deadlines', 'Terminy badań']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-[44px] px-4 text-sm font-medium ${tab === k ? 'border-b-2 border-orange-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{l}</button>
        ))}
      </div>

      {tab === 'deadlines' ? (
        <DeadlinesView />
      ) : tab === 'simple' ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="relative sm:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input className={`${fieldClass} min-h-[44px] pl-9`} placeholder="Szukaj: numer, nazwa, budynek…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj" />
            </div>
            <input type="date" className={`${fieldClass} min-h-[44px]`} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Data od" />
            <input type="date" className={`${fieldClass} min-h-[44px]`} value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Data do" />
          </div>
          {error && <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
          {simple === null ? <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : <SimpleProtocolList items={simple} />}
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input className={`${fieldClass} min-h-[44px] pl-9`} placeholder="Szukaj: numer, budowa, adres…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj" />
            </div>
            <select className={`${fieldClass} min-h-[44px]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Wszystkie statusy</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select className={`${fieldClass} min-h-[44px]`} value={objectType} onChange={(e) => setObjectType(e.target.value)} aria-label="Typ obiektu">
              <option value="">Wszystkie typy obiektów</option>
              {OBJECT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {isPrivileged && (
              <select className={`${fieldClass} min-h-[44px]`} value={performerId} onChange={(e) => setPerformerId(e.target.value)} aria-label="Wykonawca">
                <option value="">Wszyscy wykonawcy</option>
                {performers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <input type="date" className={`${fieldClass} min-h-[44px]`} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Data od" />
            <input type="date" className={`${fieldClass} min-h-[44px]`} value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Data do" />
          </div>
          {error && <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
          {items === null ? <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : <ProtocolList items={items} />}
        </>
      )}

      <NewProtocolChooser open={wizard} onClose={() => setWizard(false)} />
    </div>
  );
}
