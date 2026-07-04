'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, CheckCircle2, PenLine } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

interface Measurement {
  id: string;
  number: string;
  performedAt: string;
  performedBy: { firstName: string; lastName: string };
  signableDocument: { isLocked: boolean } | null;
}

interface Site { id: string; name: string; }

export default function MeasurementsPage() {
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);

  const loadAll = useCallback(async () => {
    const siteList = await apiClient<Site[]>('/api/sites').catch(() => []);
    setSites(siteList);
    if (siteList.length) {
      const all = await Promise.all(
        siteList.map((s) => apiClient<Measurement[]>(`/api/measurements/site/${s.id}`).catch(() => [])),
      );
      setMeasurements(all.flat());
    } else {
      setMeasurements([]);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleCreate = async () => {
    if (!sites.length) { alert('Najpierw utwórz przynajmniej jedną budowę.'); return; }
    const siteId = sites.length === 1 ? sites[0].id : window.prompt(`Podaj ID budowy:\n${sites.map((s) => `${s.id} — ${s.name}`).join('\n')}`);
    if (!siteId) return;
    const description = window.prompt('Opis pomiaru:') || '';
    await apiClient('/api/measurements', { method: 'POST', body: { siteId, description, results: {} } }).catch((err) => alert(err.message));
    loadAll();
  };

  if (measurements === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Pomiary</h1>
          <p className="text-sm text-zinc-500">Protokoły pomiarowe przypisane do budów.</p>
        </div>
        <Button onClick={handleCreate} className="bg-orange-600 text-white hover:bg-orange-500">
          <Plus className="mr-1 h-4 w-4" /> Nowy pomiar
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-2.5">Numer</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Wykonał</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((m) => (
              <tr key={m.id} className="border-b border-zinc-800 last:border-0">
                <td className="px-4 py-2.5 font-medium text-zinc-100">{m.number}</td>
                <td className="px-4 py-2.5 text-zinc-500">{new Date(m.performedAt).toLocaleDateString('pl-PL')}</td>
                <td className="px-4 py-2.5 text-zinc-300">{m.performedBy?.firstName} {m.performedBy?.lastName}</td>
                <td className="px-4 py-2.5">
                  {m.signableDocument?.isLocked ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Podpisany</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-orange-400"><PenLine className="h-3.5 w-3.5" /> Oczekuje na podpis</span>
                  )}
                </td>
              </tr>
            ))}
            {measurements.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Brak pomiarów</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
