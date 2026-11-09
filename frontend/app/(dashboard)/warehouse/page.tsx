'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Loader2, MapPin, Plus, Search, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface Shelf { id: string; name: string }
interface Rack { id: string; name: string; shelves: Shelf[] }
interface StockLevel {
  quantity: number;
  minQuantity: number | null;
  warehouse: { id: string; name: string };
  shelf?: { id: string; name: string; rack: { id: string; name: string } } | null;
}
interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  stockLevels: StockLevel[];
}
interface Warehouse { id: string; name: string; address: string | null; racks?: Rack[] }

const CATEGORY_OPTIONS = [
  { value: 'CABLES', label: 'Kable' },
  { value: 'WIRES', label: 'Przewody' },
  { value: 'SOCKETS', label: 'Gniazdka' },
  { value: 'DISTRIBUTION_BOARDS', label: 'Rozdzielnice' },
  { value: 'FUSES', label: 'Bezpieczniki' },
  { value: 'TOOLS', label: 'Narzędzia' },
  { value: 'FITTINGS', label: 'Osprzęt' },
  { value: 'OTHER', label: 'Pozostałe' },
];

const emptyForm = { name: '', code: '', category: 'OTHER', unit: 'szt.', quantity: '0', minQuantity: '' };
const emptyWarehouseForm = { name: '', address: '' };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pl', { numeric: true, sensitivity: 'base' });
const locLabel = (l?: StockLevel) => (l?.shelf ? `${l.shelf.rack.name} · ${l.shelf.name}` : null);

const pickBtn = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm transition-colors ${active ? 'border-orange-500 bg-orange-600/20 text-orange-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'}`;

/** Wybór regału i półki przyciskami (opcjonalny). */
function LocationPicker({ racks, rackId, shelfId, onChange }: { racks: Rack[]; rackId: string; shelfId: string; onChange: (rackId: string, shelfId: string) => void }) {
  const sorted = [...racks].sort(byName);
  const rack = sorted.find((r) => r.id === rackId);
  return (
    <div className="mb-3" data-testid="loc-picker">
      <label className={labelClass}>Regał (opcjonalnie)</label>
      {sorted.length === 0 ? (
        <p className="mb-2 text-xs text-zinc-500">Ten magazyn nie ma jeszcze regałów — administrator może je dodać po otwarciu magazynu.</p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange('', '')} aria-pressed={!rackId} data-testid="loc-rack-none" className={pickBtn(!rackId)}>Bez regału</button>
          {sorted.map((r) => (
            <button key={r.id} type="button" onClick={() => onChange(r.id, '')} aria-pressed={rackId === r.id} data-testid={`loc-rack-${r.id}`} className={pickBtn(rackId === r.id)}>{r.name}</button>
          ))}
        </div>
      )}
      {rack && (
        <>
          <label className={labelClass}>Półka</label>
          {rack.shelves.length === 0 ? (
            <p className="mb-2 text-xs text-zinc-500">Ten regał nie ma jeszcze półek — administrator może je dodać.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[...rack.shelves].sort(byName).map((sh) => (
                <button key={sh.id} type="button" onClick={() => onChange(rack.id, sh.id)} aria-pressed={shelfId === sh.id} data-testid={`loc-shelf-${sh.id}`} className={pickBtn(shelfId === sh.id)}>{sh.name}</button>
              ))}
            </div>
          )}
          {!shelfId && rack.shelves.length > 0 && <p className="mt-1 text-xs text-orange-300">Wybierz półkę, żeby zapisać lokalizację.</p>}
        </>
      )}
    </div>
  );
}

/** Wybór magazynu przyciskami (działa pewnie na telefonie, bez natywnej listy). */
function WarehousePicker({ warehouses, value, onChange }: { warehouses: Warehouse[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2" data-testid="wh-picker">
      {warehouses.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => onChange(w.id)}
          aria-pressed={value === w.id}
          data-testid={`wh-pick-${w.id}`}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            value === w.id ? 'border-orange-500 bg-orange-600/20 text-orange-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
          }`}
        >
          <WarehouseIcon className="h-3.5 w-3.5 text-orange-500" /> {w.name}
        </button>
      ))}
    </div>
  );
}

export default function WarehousePage() {
  const { isPrivileged, user } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  // null = widok ogólny (wszystkie magazyny), inaczej id otwartego magazynu
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formWarehouseId, setFormWarehouseId] = useState('');
  const [formRackId, setFormRackId] = useState('');
  const [formShelfId, setFormShelfId] = useState('');
  const [rackFilter, setRackFilter] = useState('');
  const [rackName, setRackName] = useState('');
  const [shelfNames, setShelfNames] = useState<Record<string, string>>({});
  const [adminBusy, setAdminBusy] = useState(false);
  // zmiana lokalizacji istniejącego produktu w otwartym magazynie
  const [locProduct, setLocProduct] = useState<Product | null>(null);
  const [locRackId, setLocRackId] = useState('');
  const [locShelfId, setLocShelfId] = useState('');
  const [savingLoc, setSavingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouseForm);
  const [savingWarehouse, setSavingWarehouse] = useState(false);

  // przypisanie istniejącego produktu "bez magazynu" do magazynu
  const [assignProduct, setAssignProduct] = useState<Product | null>(null);
  const [assignWarehouseId, setAssignWarehouseId] = useState('');
  const [assignQty, setAssignQty] = useState('0');
  const [assignRackId, setAssignRackId] = useState('');
  const [assignShelfId, setAssignShelfId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const loadProducts = useCallback((query = '') => {
    apiClient<Product[]>(`/api/warehouse/products${query ? `?search=${encodeURIComponent(query)}` : ''}`)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);
  const loadWarehouses = useCallback(() => {
    apiClient<Warehouse[]>('/api/warehouse/warehouses').then(setWarehouses).catch(() => setWarehouses([]));
  }, []);

  useEffect(() => { loadWarehouses(); }, [loadWarehouses]);

  useEffect(() => {
    const t = setTimeout(() => loadProducts(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, loadProducts]);

  const canAddProduct = isPrivileged || user?.role === 'INSTALATOR';
  const selected = warehouses.find((w) => w.id === selectedId) ?? null;
  const racksOf = (id: string) => warehouses.find((w) => w.id === id)?.racks ?? [];
  const isAdmin = user?.role === 'ADMIN';

  const countFor = (id: string) => (products ?? []).filter((p) => p.stockLevels.some((l) => l.warehouse.id === id)).length;
  const unassigned = (products ?? []).filter((p) => p.stockLevels.length === 0);

  const openModal = () => {
    setForm(emptyForm);
    // w otwartym magazynie produkt trafia do niego; w widoku ogólnym trzeba wybrać
    setFormWarehouseId(selected ? selected.id : warehouses.length === 1 ? warehouses[0].id : '');
    setFormRackId(''); setFormShelfId('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWarehouseId) { alert('Wybierz magazyn, do którego ma trafić produkt.'); return; }
    setSubmitting(true);
    try {
      await apiClient<Product>('/api/warehouse/products', {
        method: 'POST',
        body: {
          name: form.name,
          code: form.code,
          category: form.category,
          unit: form.unit,
          warehouseId: formWarehouseId,
          ...(formShelfId ? { shelfId: formShelfId } : {}),
          quantity: Number(form.quantity) || 0,
          ...(form.minQuantity ? { minQuantity: Number(form.minQuantity) } : {}),
        },
      });
      setModalOpen(false);
      loadProducts(search);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openWarehouseModal = () => { setWarehouseForm(emptyWarehouseForm); setWarehouseModalOpen(true); };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWarehouse(true);
    try {
      await apiClient('/api/warehouse/warehouses', {
        method: 'POST',
        body: { name: warehouseForm.name, address: warehouseForm.address || undefined },
      });
      setWarehouseModalOpen(false);
      loadWarehouses();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingWarehouse(false);
    }
  };

  const openAssign = (p: Product) => {
    setAssignProduct(p);
    setAssignWarehouseId(selected ? selected.id : warehouses.length === 1 ? warehouses[0].id : '');
    setAssignQty('0'); setAssignRackId(''); setAssignShelfId('');
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignProduct) return;
    if (!assignWarehouseId) { alert('Wybierz magazyn.'); return; }
    setAssigning(true);
    try {
      await apiClient(`/api/warehouse/products/${assignProduct.id}/stock`, {
        method: 'PATCH',
        body: { warehouseId: assignWarehouseId, quantity: Number(assignQty) || 0, ...(assignShelfId ? { shelfId: assignShelfId } : {}) },
      });
      setAssignProduct(null);
      loadProducts(search);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const adminCall = async (fn: () => Promise<unknown>) => {
    setAdminBusy(true);
    try { await fn(); loadWarehouses(); } catch (err: any) { alert(err.message); } finally { setAdminBusy(false); }
  };
  const addRack = () => {
    if (!selected || !rackName.trim()) return;
    adminCall(async () => {
      await apiClient(`/api/warehouse/warehouses/${selected.id}/racks`, { method: 'POST', body: { name: rackName.trim() } });
      setRackName('');
    });
  };
  const addShelf = (rack: Rack) => {
    const name = (shelfNames[rack.id] ?? '').trim();
    if (!name) return;
    adminCall(async () => {
      await apiClient(`/api/warehouse/racks/${rack.id}/shelves`, { method: 'POST', body: { name } });
      setShelfNames((m) => ({ ...m, [rack.id]: '' }));
    });
  };
  const removeRack = (rack: Rack) => {
    const n = products!.filter((p) => p.stockLevels.some((l) => l.shelf?.rack.id === rack.id)).length;
    if (!window.confirm(`Usunąć ${rack.name} razem z półkami?${n ? ` ${n} prod. zostanie w magazynie, ale bez lokalizacji.` : ''}`)) return;
    adminCall(async () => { await apiClient(`/api/warehouse/racks/${rack.id}`, { method: 'DELETE' }); if (rackFilter === rack.id) setRackFilter(''); loadProducts(search); });
  };
  const removeShelf = (rack: Rack, shelf: Shelf) => {
    const n = products!.filter((p) => p.stockLevels.some((l) => l.shelf?.id === shelf.id)).length;
    if (!window.confirm(`Usunąć ${rack.name} · ${shelf.name}?${n ? ` ${n} prod. zostanie w magazynie, ale bez lokalizacji.` : ''}`)) return;
    adminCall(async () => { await apiClient(`/api/warehouse/shelves/${shelf.id}`, { method: 'DELETE' }); loadProducts(search); });
  };

  const openLoc = (p: Product) => {
    const l = p.stockLevels.find((x) => x.warehouse.id === selected?.id);
    setLocProduct(p);
    setLocRackId(l?.shelf?.rack.id ?? '');
    setLocShelfId(l?.shelf?.id ?? '');
  };
  const handleSaveLoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locProduct || !selected) return;
    setSavingLoc(true);
    try {
      await apiClient(`/api/warehouse/products/${locProduct.id}/location`, {
        method: 'PATCH',
        body: { warehouseId: selected.id, shelfId: locShelfId || null },
      });
      setLocProduct(null);
      loadProducts(search);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingLoc(false);
    }
  };

  if (products === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  const inSelected = (p: Product) => p.stockLevels.find((l) => l.warehouse.id === selected?.id);
  const visible = selected
    ? products.filter((p) => {
        const l = inSelected(p);
        if (!l) return false;
        if (!rackFilter) return true;
        if (rackFilter === 'none') return !l.shelf;
        return l.shelf?.rack.id === rackFilter;
      })
    : products;
  const canAssign = isPrivileged || user?.role === 'MAGAZYNIER';

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white" data-testid="wh-title">{selected ? selected.name : 'Magazyn'}</h1>
          <p className="text-sm text-zinc-500">
            {selected ? (selected.address || 'Produkty w tym magazynie.') : 'Wszystkie magazyny — wybierz magazyn, aby go otworzyć.'}
          </p>
        </div>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj produktu..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 focus:border-orange-500 focus:outline-none"
          />
        </div>
        {isPrivileged && !selected && (
          <Button onClick={openWarehouseModal} variant="outline" className="border-zinc-700 text-zinc-300" data-testid="wh-new">
            <WarehouseIcon className="mr-1 h-4 w-4" /> Nowy magazyn
          </Button>
        )}
        {canAddProduct && (
          <Button onClick={openModal} disabled={warehouses.length === 0} className="bg-orange-600 text-white hover:bg-orange-500" data-testid="wh-add-product">
            <Plus className="mr-1 h-4 w-4" /> Dodaj produkt
          </Button>
        )}
      </div>

      {warehouses.length === 0 && (
        <p className="mb-4 rounded-lg border border-orange-800/40 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
          {isPrivileged
            ? 'Nie masz jeszcze żadnego magazynu — kliknij „Nowy magazyn", żeby móc dodawać produkty.'
            : 'Nie ma jeszcze żadnego magazynu — poproś administratora o jego utworzenie.'}
        </p>
      )}

      {selected ? (
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          data-testid="wh-back"
          className="mb-4 flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
        >
          <ArrowLeft className="h-4 w-4" /> Wszystkie magazyny
        </button>
      ) : (
        warehouses.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="wh-cards">
            {warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedId(w.id)}
                data-testid={`wh-card-${w.id}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left transition-colors hover:border-orange-500"
              >
                <WarehouseIcon className="mb-1.5 h-5 w-5 text-orange-500" />
                <p className="truncate text-sm font-medium text-zinc-100">{w.name}</p>
                <p className="text-xs text-zinc-500">{countFor(w.id)} prod.</p>
              </button>
            ))}
          </div>
        )
      )}

      {!selected && unassigned.length > 0 && (
        <p className="mb-3 rounded-lg border border-orange-800/40 bg-orange-950/20 px-3 py-2 text-xs text-orange-300" data-testid="wh-unassigned-note">
          {unassigned.length} produktów nie jest przypisanych do żadnego magazynu{canAssign ? ' — kliknij „Przypisz" przy produkcie.' : '.'}
        </p>
      )}

      {selected && (
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3" data-testid="rack-panel">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200"><MapPin className="h-4 w-4 text-orange-500" /> Regały i półki</div>
          {(selected.racks ?? []).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2" data-testid="rack-filter">
              <button type="button" onClick={() => setRackFilter('')} aria-pressed={!rackFilter} data-testid="rack-filter-all" className={pickBtn(!rackFilter)}>Wszystkie</button>
              {[...(selected.racks ?? [])].sort(byName).map((r) => (
                <button key={r.id} type="button" onClick={() => setRackFilter(r.id)} aria-pressed={rackFilter === r.id} data-testid={`rack-filter-${r.id}`} className={pickBtn(rackFilter === r.id)}>{r.name}</button>
              ))}
              <button type="button" onClick={() => setRackFilter('none')} aria-pressed={rackFilter === 'none'} data-testid="rack-filter-none" className={pickBtn(rackFilter === 'none')}>Bez regału</button>
            </div>
          )}
          {isAdmin && (
            <div className="space-y-3" data-testid="rack-admin">
              {[...(selected.racks ?? [])].sort(byName).map((r) => (
                <div key={r.id} className="rounded-lg border border-zinc-800 p-2.5" data-testid={`rack-box-${r.id}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-100">{r.name}</span>
                    <button type="button" disabled={adminBusy} onClick={() => removeRack(r)} aria-label={`Usuń ${r.name}`} data-testid={`rack-del-${r.id}`} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {[...r.shelves].sort(byName).map((sh) => (
                      <span key={sh.id} className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 py-0.5 pl-2.5 pr-1 text-xs text-zinc-300">
                        {sh.name}
                        <button type="button" disabled={adminBusy} onClick={() => removeShelf(r, sh)} aria-label={`Usuń ${sh.name}`} data-testid={`shelf-del-${sh.id}`} className="rounded-full p-0.5 text-zinc-500 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {r.shelves.length === 0 && <span className="text-xs text-zinc-500">Brak półek</span>}
                  </div>
                  <div className="flex gap-2">
                    <input value={shelfNames[r.id] ?? ''} onChange={(e) => setShelfNames((m) => ({ ...m, [r.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addShelf(r); } }} placeholder="Nowa półka, np. B lub 2" data-testid={`shelf-input-${r.id}`} className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-orange-500 focus:outline-none" />
                    <Button type="button" disabled={adminBusy || !(shelfNames[r.id] ?? '').trim()} onClick={() => addShelf(r)} data-testid={`shelf-add-${r.id}`} className="bg-orange-600 text-white hover:bg-orange-500"><Plus className="mr-1 h-4 w-4" /> Półka</Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={rackName} onChange={(e) => setRackName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRack(); } }} placeholder="Nowy regał, np. Regał 1 lub Regał A" data-testid="rack-input" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-orange-500 focus:outline-none" />
                <Button type="button" disabled={adminBusy || !rackName.trim()} onClick={addRack} data-testid="rack-add" className="bg-orange-600 text-white hover:bg-orange-500"><Plus className="mr-1 h-4 w-4" /> Regał</Button>
              </div>
            </div>
          )}
          {!isAdmin && (selected.racks ?? []).length === 0 && <p className="text-xs text-zinc-500">Brak regałów — dodaje je administrator.</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-2.5">Produkt</th>
              <th className="px-4 py-2.5">Kod</th>
              {selected && <th className="px-4 py-2.5">Lokalizacja</th>}
              <th className="px-4 py-2.5">{selected ? 'Stan' : 'Magazyny'}</th>
              {!selected && <th className="px-4 py-2.5">Stan łączny</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const levels = selected ? p.stockLevels.filter((l) => l.warehouse.id === selected.id) : p.stockLevels;
              const totalQty = levels.reduce((s, l) => s + l.quantity, 0);
              const low = levels.some((l) => l.minQuantity != null && l.quantity <= l.minQuantity);
              return (
                <tr key={p.id} data-testid={`wh-row-${p.code}`} className={`border-b border-zinc-800 last:border-0 ${low ? 'bg-red-950/20' : ''}`}>
                  <td className="px-4 py-2.5 text-zinc-100">{p.name}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{p.code}</td>
                  {selected ? (
                    <>
                      <td className="px-4 py-2.5" data-testid={`wh-loc-${p.code}`}>
                        <span className="flex items-center gap-2">
                          {locLabel(levels[0]) ? (
                            <span className="rounded-full border border-orange-800/50 bg-orange-950/30 px-2 py-0.5 text-xs text-orange-200">{locLabel(levels[0])}</span>
                          ) : (
                            <span className="text-xs text-zinc-500">—</span>
                          )}
                          {canAssign && (
                            <button type="button" onClick={() => openLoc(p)} data-testid={`wh-setloc-${p.code}`} className="text-xs text-orange-400 underline hover:text-orange-300">Zmień</button>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${low ? 'bg-red-900/40 text-red-300' : 'bg-emerald-900/30 text-emerald-300'}`}>
                          {totalQty} {p.unit}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        {p.stockLevels.length === 0 ? (
                          <span className="flex items-center gap-2">
                            <span className="rounded-full bg-orange-900/30 px-2 py-0.5 text-xs text-orange-300">Bez magazynu</span>
                            {canAssign && warehouses.length > 0 && (
                              <button type="button" onClick={() => openAssign(p)} data-testid={`wh-assign-${p.code}`} className="text-xs text-orange-400 underline hover:text-orange-300">Przypisz</button>
                            )}
                          </span>
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            {p.stockLevels.map((l) => (
                              <span key={l.warehouse.id} className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
                                {l.warehouse.name}: {l.quantity} {p.unit}{locLabel(l) ? ` · ${locLabel(l)}` : ''}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.stockLevels.length > 0 && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${low ? 'bg-red-900/40 text-red-300' : 'bg-emerald-900/30 text-emerald-300'}`}>
                            {totalQty} {p.unit}
                          </span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={selected ? 3 : 4} className="px-4 py-8 text-center text-zinc-500">
                {selected ? 'Ten magazyn jest pusty — użyj „Dodaj produkt".' : 'Brak produktów'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        closeOnOverlayClick={false}
        title={selected ? `Nowy produkt — ${selected.name}` : 'Nowy produkt'}
        description="Uzupełnij dane i zapisz — wszystko na jednym ekranie."
      >
        <form onSubmit={handleSubmit}>
          {!selected && (
            <>
              <label className={labelClass}>Magazyn (wymagane)</label>
              <WarehousePicker warehouses={warehouses} value={formWarehouseId} onChange={(id) => { setFormWarehouseId(id); setFormRackId(''); setFormShelfId(''); }} />
            </>
          )}

          <LocationPicker
            racks={racksOf(formWarehouseId)}
            rackId={formRackId}
            shelfId={formShelfId}
            onChange={(r, sh) => { setFormRackId(r); setFormShelfId(sh); }}
          />

          <label className={labelClass}>Nazwa produktu</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Kabel YDYp 3x2,5" className={fieldClass} />

          <label className={labelClass}>Kod produktu</label>
          <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="np. KAB-001" className={fieldClass} />

          <label className={labelClass}>Kategoria</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={fieldClass}>
            {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Jednostka</label>
              <input required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="szt., mb, kg..." className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Stan początkowy</label>
              <input type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <label className={labelClass}>Próg alarmowy (opcjonalnie)</label>
          <input type="number" min="0" step="0.01" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} placeholder="np. 10" className={fieldClass} />

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500" data-testid="wh-save-product">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!locProduct}
        onClose={() => setLocProduct(null)}
        closeOnOverlayClick={false}
        title="Lokalizacja w magazynie"
        description={locProduct && selected ? `${locProduct.name} — ${selected.name}` : undefined}
      >
        <form onSubmit={handleSaveLoc}>
          <LocationPicker racks={selected?.racks ?? []} rackId={locRackId} shelfId={locShelfId} onChange={(r, sh) => { setLocRackId(r); setLocShelfId(sh); }} />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setLocProduct(null)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={savingLoc} className="bg-orange-600 text-white hover:bg-orange-500" data-testid="wh-loc-save">
              {savingLoc ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!assignProduct}
        onClose={() => setAssignProduct(null)}
        closeOnOverlayClick={false}
        title="Przypisz do magazynu"
        description={assignProduct ? `${assignProduct.name} (${assignProduct.code})` : undefined}
      >
        <form onSubmit={handleAssign}>
          <label className={labelClass}>Magazyn</label>
          <WarehousePicker warehouses={warehouses} value={assignWarehouseId} onChange={(id) => { setAssignWarehouseId(id); setAssignRackId(''); setAssignShelfId(''); }} />
          {assignWarehouseId && <LocationPicker racks={racksOf(assignWarehouseId)} rackId={assignRackId} shelfId={assignShelfId} onChange={(r, sh) => { setAssignRackId(r); setAssignShelfId(sh); }} />}
          <label className={labelClass}>Stan w tym magazynie{assignProduct ? ` (${assignProduct.unit})` : ''}</label>
          <input type="number" min="0" step="0.01" value={assignQty} onChange={(e) => setAssignQty(e.target.value)} className={fieldClass} />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAssignProduct(null)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={assigning} className="bg-orange-600 text-white hover:bg-orange-500" data-testid="wh-assign-save">
              {assigning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={warehouseModalOpen} onClose={() => setWarehouseModalOpen(false)} closeOnOverlayClick={false} title="Nowy magazyn">
        <form onSubmit={handleCreateWarehouse}>
          <label className={labelClass}>Nazwa magazynu</label>
          <input required value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} placeholder="np. Magazyn główny" className={fieldClass} />

          <label className={labelClass}>Adres (opcjonalnie)</label>
          <input value={warehouseForm.address} onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })} placeholder="np. ul. Magazynowa 5, Kraków" className={fieldClass} />

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWarehouseModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={savingWarehouse} className="bg-orange-600 text-white hover:bg-orange-500">
              {savingWarehouse ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
