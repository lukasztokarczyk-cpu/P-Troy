'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Hash, Calendar } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  registrationNumber: string;
  inspectionDueDate: string | null;
  assignments: { user: { firstName: string; lastName: string } }[];
}

const TYPE_OPTIONS = [
  { value: 'CAR', label: 'Samochód' },
  { value: 'VAN', label: 'Bus' },
  { value: 'EXCAVATOR', label: 'Koparka' },
  { value: 'LIFT', label: 'Podnośnik' },
  { value: 'TRAILER', label: 'Przyczepa' },
  { value: 'GENERATOR', label: 'Agregat' },
];

const emptyForm = { type: 'CAR', make: '', model: '', registrationNumber: '', inspectionDueDate: '' };

export default function VehiclesPage() {
  const { isPrivileged, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const loadVehicles = useCallback(() => {
    apiClient<Vehicle[]>('/api/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, []);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  const openModal = () => { setForm(emptyForm); setModalOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient('/api/vehicles', {
        method: 'POST',
        body: { ...form, inspectionDueDate: form.inspectionDueDate || undefined },
      });
      setModalOpen(false);
      loadVehicles();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (id: string) => {
    await apiClient(`/api/vehicles/${id}/claim`, { method: 'POST' }).catch((err) => alert(err.message));
    loadVehicles();
  };

  const handleLogLocation = async (id: string) => {
    const location = window.prompt('Gdzie obecnie jesteś z tym pojazdem?');
    if (!location) return;
    await apiClient(`/api/vehicles/${id}/usage-log`, { method: 'POST', body: { location } }).catch((err) => alert(err.message));
  };

  if (vehicles === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Pojazdy</h1>
          <p className="text-sm text-zinc-500">Flota firmowa.</p>
        </div>
        {isPrivileged && (
          <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
            <Plus className="mr-1 h-4 w-4" /> Dodaj pojazd
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vehicles.map((v) => (
          <div key={v.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-100">{v.make} {v.model}</h3>
            <div className="flex flex-col gap-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {v.registrationNumber}</span>
              {v.inspectionDueDate && (
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Przegląd: {new Date(v.inspectionDueDate).toLocaleDateString('pl-PL')}</span>
              )}
            </div>
            {user?.role === 'INSTALATOR' && (
              <div className="mt-3 flex gap-2 border-t border-zinc-800 pt-3">
                <Button size="sm" variant="outline" onClick={() => handleClaim(v.id)} className="flex-1 border-zinc-700 text-xs text-zinc-300">
                  Mam do dyspozycji
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleLogLocation(v.id)} className="flex-1 border-zinc-700 text-xs text-zinc-300">
                  Zgłoś lokalizację
                </Button>
              </div>
            )}
          </div>
        ))}
        {vehicles.length === 0 && <p className="col-span-full py-12 text-center text-sm text-zinc-500">Brak pojazdów.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowy pojazd">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Typ pojazdu</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={fieldClass}>
            {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Marka</label>
              <input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="np. VW" className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="np. Crafter" className={fieldClass} />
            </div>
          </div>

          <label className={labelClass}>Nr rejestracyjny</label>
          <input required value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} placeholder="np. KR 1234A" className={fieldClass} />

          <label className={labelClass}>Data przeglądu (opcjonalnie)</label>
          <input type="date" value={form.inspectionDueDate} onChange={(e) => setForm({ ...form, inspectionDueDate: e.target.value })} className={fieldClass} />

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
