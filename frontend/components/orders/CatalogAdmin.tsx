'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { errorMessage } from '@/lib/protocols';
import { UNIT_OPTIONS, type CatalogCategory } from '@/lib/orders';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { inputCls } from '@/components/protocols/ProtocolInputs';

/** Katalog materiałów dla administratora: dodawanie pozycji i kategorii, włączanie/wyłączanie — bez zmian w kodzie. */
export function CatalogAdmin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cats, setCats] = useState<CatalogCategory[] | null>(null);
  const [error, setError] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newItem, setNewItem] = useState<Record<string, { name: string; unit: string }>>({});

  const load = useCallback(() => {
    apiClient<CatalogCategory[]>('/api/orders/catalog?all=1').then(setCats).catch((e) => { setCats([]); setError(errorMessage(e)); });
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); load(); } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Katalog materiałów" description="Zmiany są od razu widoczne dla instalatorów" maxWidth="max-w-2xl" closeOnOverlayClick={false}>
      {error && <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
      <div className="mb-4 flex gap-2">
        <input className={inputCls} placeholder="Nowa kategoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Nowa kategoria" />
        <Button className="h-11" disabled={!newCat.trim()} onClick={() => act(async () => { await apiClient('/api/orders/catalog/categories', { method: 'POST', body: { name: newCat.trim() } }); setNewCat(''); })}><Plus className="h-4 w-4" /></Button>
      </div>
      {cats === null ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : (
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1" data-testid="catalog-admin">
          {cats.map((c) => {
            const draft = newItem[c.id] ?? { name: '', unit: 'szt.' };
            return (
              <div key={c.id} className="rounded-xl border border-zinc-800 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${c.isActive ? 'text-zinc-100' : 'text-zinc-500 line-through'}`}>{c.name}</p>
                  <button type="button" className="text-xs text-orange-400" onClick={() => act(() => apiClient(`/api/orders/catalog/categories/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }))}>{c.isActive ? 'Wyłącz' : 'Włącz'}</button>
                </div>
                <ul className="space-y-1">
                  {c.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className={i.isActive ? 'text-zinc-300' : 'text-zinc-600 line-through'}>{i.name} <span className="text-xs text-zinc-600">({i.defaultUnit})</span></span>
                      <button type="button" className="shrink-0 text-xs text-orange-400" onClick={() => act(() => apiClient(`/api/orders/catalog/items/${i.id}`, { method: 'PATCH', body: { isActive: !i.isActive } }))}>{i.isActive ? 'Wyłącz' : 'Włącz'}</button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <input className={inputCls} placeholder="Nowy materiał" value={draft.name} onChange={(e) => setNewItem((m) => ({ ...m, [c.id]: { ...draft, name: e.target.value } }))} aria-label={`Nowy materiał w ${c.name}`} />
                  <select className={`${inputCls} w-24`} value={draft.unit} onChange={(e) => setNewItem((m) => ({ ...m, [c.id]: { ...draft, unit: e.target.value } }))} aria-label="Jednostka">
                    {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                  <Button className="h-11" disabled={!draft.name.trim()} onClick={() => act(async () => { await apiClient('/api/orders/catalog/items', { method: 'POST', body: { categoryId: c.id, name: draft.name.trim(), defaultUnit: draft.unit } }); setNewItem((m) => ({ ...m, [c.id]: { name: '', unit: 'szt.' } })); })}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex justify-end"><Button className="h-11" onClick={onClose}>Zamknij</Button></div>
    </Modal>
  );
}
