'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Loader2, Plus, Search } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/modal';
import { errorMessage } from '@/lib/protocols';
import { CHANGEABLE_STATUSES, ORDER_STATUS_LABELS, type OrderListItem, type OrderStatus, type SiteOption } from '@/lib/orders';
import { OrderList } from '@/components/orders/OrderParts';
import { CatalogAdmin } from '@/components/orders/CatalogAdmin';

export default function OrdersPage() {
  const router = useRouter();
  const { user, isPrivileged, workMode } = useAuth();
  const isAdmin = user?.role === 'ADMIN' && workMode === 'ADMIN';
  const [items, setItems] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [siteId, setSiteId] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [catalog, setCatalog] = useState(false);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (status) qs.set('status', status);
    if (siteId) qs.set('siteId', siteId);
    if (authorId) qs.set('createdById', authorId);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    setError('');
    apiClient<OrderListItem[]>(`/api/orders?${qs}`).then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [q, status, siteId, authorId, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (isPrivileged) apiClient<SiteOption[]>('/api/orders/sites').then(setSites).catch(() => setSites([]));
  }, [isPrivileged]);

  // Zamawiający widoczni na liście — do filtra (z wyników, bez dodatkowego endpointu)
  const authors = Array.from(new Map((items ?? []).map((o) => [o.createdById, o.createdByName])).entries());
  const statusOptions: OrderStatus[] = isPrivileged ? CHANGEABLE_STATUSES : ['DRAFT', ...CHANGEABLE_STATUSES];

  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Zamówienia</h1>
        <div className="flex gap-2">
          {isAdmin && <Button variant="outline" className="h-11" onClick={() => setCatalog(true)} data-testid="catalog-btn"><BookOpen className="mr-2 h-4 w-4" />Katalog</Button>}
          <Button className="h-11" onClick={() => router.push('/orders/new')} data-testid="new-order"><Plus className="mr-2 h-4 w-4" />Nowe zamówienie</Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input className={`${fieldClass} min-h-[44px] pl-9`} placeholder="Szukaj: numer, budowa, materiał…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj" />
        </div>
        <select className={`${fieldClass} min-h-[44px]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Wszystkie statusy</option>
          {statusOptions.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
        </select>
        {isPrivileged && (
          <>
            <select className={`${fieldClass} min-h-[44px]`} value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Budowa">
              <option value="">Wszystkie budowy</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={`${fieldClass} min-h-[44px]`} value={authorId} onChange={(e) => setAuthorId(e.target.value)} aria-label="Zamawiający">
              <option value="">Wszyscy zamawiający</option>
              {authors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <input type="date" className={`${fieldClass} min-h-[44px]`} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Data od" />
            <input type="date" className={`${fieldClass} min-h-[44px]`} value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Data do" />
          </>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
      {items === null ? <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : <OrderList items={items} showAuthor={isPrivileged} />}
      {isAdmin && <CatalogAdmin open={catalog} onClose={() => setCatalog(false)} />}
    </div>
  );
}
