'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Search, Warehouse as WarehouseIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  stockLevels: { quantity: number; minQuantity: number | null; warehouse: { name: string } }[];
}
interface Warehouse { id: string; name: string; address: string | null; }

const CATEGORY_OPTIONS = [
  { value: 'CABLES', label: 'Kable / przewody' },
  { value: 'SOCKETS', label: 'Gniazdka' },
  { value: 'SWITCHBOARDS', label: 'Rozdzielnice' },
  { value: 'FUSES', label: 'Bezpieczniki' },
  { value: 'TOOLS', label: 'Narzędzia' },
  { value: 'OTHER', label: 'Pozostałe' },
];

const emptyForm = { name: '', code: '', category: 'OTHER', unit: 'szt.', quantity: '0', minQuantity: '' };
const emptyWarehouseForm = { name: '', address: '' };

export default function WarehousePage() {
  const { isPrivileged, user } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouseForm);
  const [savingWarehouse, setSavingWarehouse] = useState(false);

  const loadProducts = useCallback((query = '') => {
    apiClient<Product[]>(`/api/warehouse/products${query ? `?search=${encodeURIComponent(query)}` : ''}`)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);
  const loadWarehouses = useCallback(() => {
    apiClient<Warehouse[]>('/api/warehouse/warehouses').then(setWarehouses).catch(() => setWarehouses([]));
  }, []);

  useEffect(() => { loadProducts(); loadWarehouses(); }, [loadProducts, loadWarehouses]);

  useEffect(() => {
    const t = setTimeout(() => loadProducts(search), 300);
    return () => clearTimeout(t);
  }, [search, loadProducts]);

  const canAddProduct = isPrivileged || user?.role === 'INSTALATOR';

  const openModal = () => { setForm(emptyForm); setModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const product = await apiClient<Product>('/api/warehouse/products', {
        method: 'POST',
        body: { name: form.name, code: form.code, category: form.category, unit: form.unit },
      });
      if ((Number(form.quantity) > 0 || form.minQuantity) && warehouses[0]) {
        await apiClient(`/api/warehouse/products/${product.id}/stock`, {
          method: 'PATCH',
          body: {
            warehouseId: warehouses[0].id,
            quantity: Number(form.quantity) || 0,
            minQuantity: form.minQuantity ? Number(form.minQuantity) : undefined,
          },
        }).catch(() => undefined);
      }
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

  if (products === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Magazyn</h1>
          <p className="text-sm text-zinc-500">Stany magazynowe produktów.</p>
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
        {isPrivileged && (
          <Button onClick={openWarehouseModal} variant="outline" className="border-zinc-700 text-zinc-300">
            <WarehouseIcon className="mr-1 h-4 w-4" /> Nowy magazyn
          </Button>
        )}
        {canAddProduct && (
          <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
            <Plus className="mr-1 h-4 w-4" /> Dodaj produkt
          </Button>
        )}
      </div>

      {warehouses.length === 0 && isPrivileged && (
        <p className="mb-4 rounded-lg border border-orange-800/40 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
          Nie masz jeszcze żadnego magazynu — kliknij „Nowy magazyn", zanim zaczniesz pobierać materiały na budowy.
        </p>
      )}

      {warehouses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {warehouses.map((w) => (
            <span key={w.id} className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
              <WarehouseIcon className="h-3 w-3 text-orange-500" /> {w.name}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-2.5">Produkt</th>
              <th className="px-4 py-2.5">Kod</th>
              <th className="px-4 py-2.5">Stan łączny</th>
              <th className="px-4 py-2.5">Jednostka</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const totalQty = p.stockLevels.reduce((s, l) => s + l.quantity, 0);
              const low = p.stockLevels.some((l) => l.minQuantity != null && l.quantity <= l.minQuantity);
              return (
                <tr key={p.id} className={`border-b border-zinc-800 last:border-0 ${low ? 'bg-red-950/20' : ''}`}>
                  <td className="px-4 py-2.5 text-zinc-100">{p.name}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{p.code}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${low ? 'bg-red-900/40 text-red-300' : 'bg-emerald-900/30 text-emerald-300'}`}>
                      {totalQty} {p.unit}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{p.unit}</td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Brak produktów</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowy produkt" description="Uzupełnij dane i zapisz — wszystko na jednym ekranie.">
        <form onSubmit={handleSubmit}>
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

          {warehouses.length === 0 && (
            <p className="mt-3 rounded-lg bg-orange-950/30 px-3 py-2 text-xs text-orange-300">
              Brak magazynu — stan początkowy nie zostanie zapisany, dopóki nie utworzysz przynajmniej jednego magazynu.
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={warehouseModalOpen} onClose={() => setWarehouseModalOpen(false)} title="Nowy magazyn">
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
