'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
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

const CATEGORY_OPTIONS = [
  { value: 'CABLES', label: 'Kable / przewody' },
  { value: 'SOCKETS', label: 'Gniazdka' },
  { value: 'SWITCHBOARDS', label: 'Rozdzielnice' },
  { value: 'FUSES', label: 'Bezpieczniki' },
  { value: 'TOOLS', label: 'Narzędzia' },
  { value: 'OTHER', label: 'Pozostałe' },
];

const emptyForm = { name: '', code: '', category: 'OTHER', unit: 'szt.', quantity: '0', minQuantity: '' };

export default function WarehousePage() {
  const { isPrivileged, user } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = useCallback((query = '') => {
    apiClient<Product[]>(`/api/warehouse/products${query ? `?search=${encodeURIComponent(query)}` : ''}`)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

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
      // Jeśli podano stan początkowy, ustawiamy go od razu w pierwszym magazynie
      if (Number(form.quantity) > 0 || form.minQuantity) {
        const warehouses = await apiClient<{ id: string }[]>('/api/warehouse/warehouses').catch(() => []);
        if (warehouses[0]) {
          await apiClient(`/api/warehouse/products/${product.id}/stock`, {
            method: 'PATCH',
            body: {
              warehouseId: warehouses[0].id,
              quantity: Number(form.quantity) || 0,
              minQuantity: form.minQuantity ? Number(form.minQuantity) : undefined,
            },
          }).catch(() => undefined);
        }
      }
      setModalOpen(false);
      loadProducts(search);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
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
        {canAddProduct && (
          <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
            <Plus className="mr-1 h-4 w-4" /> Dodaj produkt
          </Button>
        )}
      </div>

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

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
