'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Plus, AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface Failure {
  id: string;
  title: string;
  description: string | null;
  status: 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED';
  priority: string;
  createdAt: string;
  reportedBy: { firstName: string; lastName: string };
  resolvedBy: { firstName: string; lastName: string } | null;
  site: { id: string; name: string } | null;
  vehicle: { id: string; brand: string; model: string; registrationNumber: string } | null;
}
interface Site { id: string; name: string; }
interface Vehicle { id: string; brand: string; model: string; registrationNumber: string; }

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  REPORTED: { label: 'Zgłoszona', color: 'bg-red-900/30 text-red-300', icon: AlertTriangle },
  IN_PROGRESS: { label: 'W trakcie naprawy', color: 'bg-orange-900/30 text-orange-300', icon: Wrench },
  RESOLVED: { label: 'Rozwiązana', color: 'bg-emerald-900/30 text-emerald-300', icon: CheckCircle2 },
};

export default function FailuresPage() {
  const { isPrivileged } = useAuth();
  const [failures, setFailures] = useState<Failure[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', siteId: '', vehicleId: '' });
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFailures = useCallback(() => {
    apiClient<Failure[]>('/api/failures').then(setFailures).catch(() => setFailures([]));
  }, []);

  useEffect(() => { loadFailures(); }, [loadFailures]);
  useEffect(() => {
    apiClient<Site[]>('/api/sites').then(setSites).catch(() => setSites([]));
    apiClient<Vehicle[]>('/api/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, []);

  const openModal = () => {
    setForm({ title: '', description: '', siteId: '', vehicleId: '' });
    setPhotoBase64(null);
    setModalOpen(true);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPhotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient('/api/failures', {
        method: 'POST',
        body: {
          title: form.title,
          description: form.description || undefined,
          siteId: form.siteId || undefined,
          vehicleId: form.vehicleId || undefined,
          photoBase64: photoBase64 || undefined,
        },
      });
      setModalOpen(false);
      loadFailures();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await apiClient(`/api/failures/${id}/status`, { method: 'PATCH', body: { status } }).catch((err) => alert(err.message));
    loadFailures();
  };

  if (failures === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Awarie</h1>
          <p className="text-sm text-zinc-500">Zgłoszenia usterek sprzętu, pojazdów i budów.</p>
        </div>
        <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
          <Plus className="mr-1 h-4 w-4" /> Zgłoś awarię
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {failures.map((f) => {
          const meta = STATUS_META[f.status];
          const Icon = meta.icon;
          return (
            <div key={f.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">{f.title}</h3>
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.color}`}>
                  <Icon className="h-3 w-3" /> {meta.label}
                </span>
              </div>
              {f.description && <p className="mb-2 text-xs text-zinc-500">{f.description}</p>}
              <div className="flex flex-col gap-0.5 text-xs text-zinc-600">
                {f.site && <span>Budowa: {f.site.name}</span>}
                {f.vehicle && <span>Pojazd: {f.vehicle.brand} {f.vehicle.model} ({f.vehicle.registrationNumber})</span>}
                <span>Zgłosił: {f.reportedBy.firstName} {f.reportedBy.lastName}</span>
                <span>{new Date(f.createdAt).toLocaleDateString('pl-PL')}</span>
              </div>
              {isPrivileged && f.status !== 'RESOLVED' && (
                <div className="mt-3 flex gap-2 border-t border-zinc-800 pt-3">
                  {f.status === 'REPORTED' && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(f.id, 'IN_PROGRESS')} className="flex-1 border-zinc-700 text-xs text-zinc-300">
                      W naprawie
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleStatusChange(f.id, 'RESOLVED')} className="flex-1 bg-orange-600 text-xs text-white hover:bg-orange-500">
                    Oznacz jako rozwiązaną
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {failures.length === 0 && <p className="col-span-full py-12 text-center text-sm text-zinc-500">Brak zgłoszonych awarii.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Zgłoś awarię">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Tytuł</label>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="np. Uszkodzona wiertarka udarowa" className={fieldClass} />

          <label className={labelClass}>Opis (opcjonalnie)</label>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Budowa (opcjonalnie)</label>
              <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} className={fieldClass}>
                <option value="">— brak —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Pojazd (opcjonalnie)</label>
              <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className={fieldClass}>
                <option value="">— brak —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registrationNumber})</option>)}
              </select>
            </div>
          </div>

          <label className={labelClass}>Zdjęcie (opcjonalnie)</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 py-3 text-sm text-zinc-400 hover:border-orange-600/50 hover:text-orange-400"
          >
            {photoBase64 ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {photoBase64 && <img src={photoBase64} alt="Podgląd" className="mt-2 h-24 w-24 rounded-lg border border-zinc-700 object-cover" />}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zgłoś
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
