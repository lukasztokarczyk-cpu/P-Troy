'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, CheckCircle2, PenLine } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ siteId: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

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

  const openModal = () => {
    setForm({ siteId: sites[0]?.id || '', description: '' });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient('/api/measurements', { method: 'POST', body: { siteId: form.siteId, description: form.description, results: {} } });
      setModalOpen(false);
      loadAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
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
        <Button onClick={openModal} disabled={!sites.length} className="bg-orange-600 text-white hover:bg-orange-500">
          <Plus className="mr-1 h-4 w-4" /> Nowy pomiar
        </Button>
      </div>

      {!sites.length && (
        <p className="mb-4 rounded-lg border border-orange-800/40 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
          Najpierw utwórz przynajmniej jedną budowę w zakładce Budowy.
        </p>
      )}

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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowy pomiar">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Budowa</label>
          <select required value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} className={fieldClass}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <label className={labelClass}>Opis pomiaru</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Zakres pomiaru, uwagi..."
            className={fieldClass}
          />

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
