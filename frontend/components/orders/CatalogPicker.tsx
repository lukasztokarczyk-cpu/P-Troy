'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Search } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { errorMessage } from '@/lib/protocols';
import { newKey, type CatalogCategory, type CatalogItem, type DraftItem } from '@/lib/orders';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { inputCls } from '@/components/protocols/ProtocolInputs';
import { ItemForm, type ItemFormValue } from './ItemForm';

type Step = { kind: 'list' } | { kind: 'catalog'; item: CatalogItem } | { kind: 'custom'; name: string };

/**
 * Wybór materiału z katalogu (kategorie A–G) lub dodanie własnego.
 * Okno zostaje otwarte po dodaniu pozycji — można dodać kilka materiałów pod rząd i kliknąć „Gotowe”.
 */
export function CatalogPicker({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (item: DraftItem) => void }) {
  const [catalog, setCatalog] = useState<CatalogCategory[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep({ kind: 'list' });
    setQ('');
    setAdded([]);
    if (catalog) return;
    apiClient<CatalogCategory[]>('/api/orders/catalog').then(setCatalog).catch((e) => { setCatalog([]); setError(errorMessage(e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = useMemo(() => {
    if (!catalog) return [];
    return catalog
      .filter((c) => !cat || c.id === cat)
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          const hay = `${i.name} ${i.specHint ?? ''} ${c.name}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        }),
      }))
      .filter((c) => c.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, cat, q]);

  const finish = (v: ItemFormValue, catalogItem: CatalogItem | null) => {
    onAdd({
      key: newKey(),
      catalogItemId: catalogItem?.id ?? null,
      name: v.name,
      spec: v.spec,
      quantity: v.quantity,
      unit: v.unit,
      note: v.note,
      isCustom: !catalogItem,
      photos: [],
      pending: [],
    });
    setAdded((a) => [...a, v.name]);
    setStep({ kind: 'list' });
    setQ('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Dodaj materiał" description={added.length ? `Dodano: ${added.length}` : 'Wybierz z katalogu lub dodaj własny'} maxWidth="max-w-lg" closeOnOverlayClick={false}>
      {step.kind === 'catalog' && (
        <ItemForm
          key={step.item.id}
          initial={{ name: step.item.name, unit: step.item.defaultUnit }}
          nameEditable={false}
          specPlaceholder={step.item.specHint ?? undefined}
          onSubmit={(v) => finish(v, step.item)}
          onCancel={() => setStep({ kind: 'list' })}
        />
      )}
      {step.kind === 'custom' && (
        <ItemForm
          key="custom"
          initial={{ name: step.name, unit: 'szt.' }}
          nameEditable
          submitLabel="Dodaj własny materiał"
          onSubmit={(v) => finish(v, null)}
          onCancel={() => setStep({ kind: 'list' })}
        />
      )}
      {step.kind === 'list' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input className={`${inputCls} pl-9`} placeholder="Szukaj: np. B16, gniazdo, YDYp" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj materiału" />
          </div>
          {catalog && catalog.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Kategorie">
              <button type="button" onClick={() => setCat('')} className={`min-h-[36px] shrink-0 rounded-full border px-3 text-xs ${cat === '' ? 'border-orange-500 bg-orange-950/40 text-orange-100' : 'border-zinc-700 text-zinc-400'}`}>Wszystkie</button>
              {catalog.map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id === cat ? '' : c.id)} className={`min-h-[36px] shrink-0 rounded-full border px-3 text-xs ${cat === c.id ? 'border-orange-500 bg-orange-950/40 text-orange-100' : 'border-zinc-700 text-zinc-400'}`}>{c.name}</button>
              ))}
            </div>
          )}
          <div className="max-h-[48vh] overflow-y-auto rounded-lg border border-zinc-800" data-testid="catalog-list">
            {catalog === null && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>}
            {error && <p className="p-3 text-xs text-red-300">{error}</p>}
            {catalog && filtered.length === 0 && <p className="p-4 text-center text-sm text-zinc-500">Nic nie znaleziono w katalogu.</p>}
            {filtered.map((c) => (
              <div key={c.id}>
                <p className="sticky top-0 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{c.name}</p>
                {c.items.map((i) => (
                  <button key={i.id} type="button" onClick={() => setStep({ kind: 'catalog', item: i })} className="flex min-h-[48px] w-full items-center justify-between gap-2 border-t border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800 active:bg-zinc-800" data-testid="catalog-item">
                    <span className="text-sm text-zinc-100">{i.name}{i.specHint && <span className="block text-xs text-zinc-500">{i.specHint}</span>}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{i.defaultUnit}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setStep({ kind: 'custom', name: q.trim() })} data-testid="add-custom">
            <Plus className="mr-2 h-4 w-4" />Dodaj własny materiał{q.trim() ? `: „${q.trim()}”` : ''}
          </Button>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-emerald-400">{added.length > 0 && (<><Check className="mr-1 inline h-3.5 w-3.5" />Dodano: {added[added.length - 1]}</>)}</p>
            <Button type="button" className="h-11 px-6" onClick={onClose}>Gotowe</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
