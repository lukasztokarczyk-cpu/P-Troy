'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, MapPin, User, Flag } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface Site {
  id: string;
  name: string;
  investor: string;
  address: string;
  status: string;
  priority: string;
  assignees: { user: { firstName: string; lastName: string } }[];
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planowana', IN_PROGRESS: 'W trakcie', ON_HOLD: 'Wstrzymana', COMPLETED: 'Zakończona', ARCHIVED: 'Zarchiwizowana',
};
const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Niski' },
  { value: 'NORMAL', label: 'Normalny' },
  { value: 'HIGH', label: 'Wysoki' },
  { value: 'CRITICAL', label: 'Krytyczny' },
];

const emptyForm = { name: '', investor: '', address: '', priority: 'NORMAL' };

export default function SitesPage() {
  const { isPrivileged } = useAuth();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const loadSites = useCallback(() => {
    apiClient<Site[]>('/api/sites').then(setSites).catch(() => setSites([]));
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);

  const openModal = () => { setForm(emptyForm); setModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient('/api/sites', { method: 'POST', body: form });
      setModalOpen(false);
      loadSites();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sites === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Budowy</h1>
          <p className="text-sm text-zinc-500">Lista aktywnych budów.</p>
        </div>
        {isPrivileged && (
          <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
            <Plus className="mr-1 h-4 w-4" /> Nowa budowa
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <div key={site.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">{site.name}</h3>
              <span className="shrink-0 rounded-full bg-orange-600/20 px-2 py-0.5 text-[10px] font-medium text-orange-400">
                {STATUS_LABELS[site.status] ?? site.status}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {site.investor}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {site.address}</span>
              <span className="flex items-center gap-1"><Flag className="h-3 w-3" /> Priorytet: {PRIORITY_OPTIONS.find((p) => p.value === site.priority)?.label ?? site.priority}</span>
            </div>
          </div>
        ))}
        {sites.length === 0 && <p className="col-span-full py-12 text-center text-sm text-zinc-500">Brak budów.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowa budowa">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Nazwa budowy</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Montaż instalacji — ul. Kwiatowa 12" className={fieldClass} />

          <label className={labelClass}>Inwestor</label>
          <input required value={form.investor} onChange={(e) => setForm({ ...form, investor: e.target.value })} placeholder="np. Jan Nowak" className={fieldClass} />

          <label className={labelClass}>Adres</label>
          <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="np. ul. Kwiatowa 12, Kraków" className={fieldClass} />

          <label className={labelClass}>Priorytet</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={fieldClass}>
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

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
