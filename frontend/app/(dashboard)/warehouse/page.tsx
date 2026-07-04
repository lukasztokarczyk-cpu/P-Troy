'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  stockLevels: { quantity: number; minQuantity: number | null; warehouse: { name: string } }[];
}

export default function WarehousePage() {
  const { isPrivileged } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState('');

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

  const handleCreate = async () => {
    const name = window.prompt('Nazwa produktu:');
    if (!name) return;
    const code = window.prompt('Kod produktu:') || name.slice(0, 8).toUpperCase();
    const unit = window.prompt('Jednostka (szt., mb, kg...):') || 'szt.';
    await apiClient('/api/warehouse/products', {
      method: 'POST',
      body: { name, code, unit, category: 'OTHER' },
    }).catch((err) => alert(err.message));
    loadProducts(search);
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
          <Button onClick={handleCreate} className="bg-orange-600 text-white hover:bg-orange-500">
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
    </div>
  );
}
