'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Plus, Receipt, Fuel, Package, MoreHorizontal } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface ExpenseNote {
  id: string;
  type: 'REFUELING' | 'MATERIAL_PURCHASE' | 'OTHER';
  amount: number;
  description: string | null;
  receiptPath: string | null;
  receiptUrl?: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string };
  vehicle?: { brand: string; model: string; registrationNumber: string } | null;
}
interface Vehicle { id: string; brand: string; model: string; registrationNumber: string; }

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  REFUELING: { label: 'Tankowanie', icon: Fuel, color: '#eab308' },
  MATERIAL_PURCHASE: { label: 'Zakup materiałów', icon: Package, color: '#38bdf8' },
  OTHER: { label: 'Inny koszt', icon: MoreHorizontal, color: '#94a3b8' },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [notes, setNotes] = useState<ExpenseNote[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ type: 'REFUELING', amount: '', description: '', vehicleId: '' });
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadNotes = useCallback(() => {
    const endpoint = isAdmin ? '/api/expenses' : '/api/expenses/mine';
    apiClient<ExpenseNote[]>(endpoint).then(setNotes).catch(() => setNotes([]));
  }, [isAdmin]);

  useEffect(() => { loadNotes(); }, [loadNotes]);
  useEffect(() => { apiClient<Vehicle[]>('/api/vehicles').then(setVehicles).catch(() => setVehicles([])); }, []);

  const openModal = () => {
    setForm({ type: 'REFUELING', amount: '', description: '', vehicleId: vehicles[0]?.id || '' });
    setReceiptBase64(null);
    setFormError(null);
    setModalOpen(true);
  };

  const handleFile = async (file: File) => {
    setReceiptBase64(await fileToBase64(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!receiptBase64) {
      setFormError('Zdjęcie paragonu lub faktury jest obowiązkowe.');
      return;
    }
    if (form.type === 'REFUELING' && !form.vehicleId) {
      setFormError('Dla tankowania musisz wskazać pojazd.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient('/api/expenses', {
        method: 'POST',
        body: {
          type: form.type,
          amount: Number(form.amount),
          description: form.description || undefined,
          vehicleId: form.type === 'REFUELING' ? form.vehicleId : undefined,
          receiptBase64,
        },
      });
      setModalOpen(false);
      loadNotes();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (notes === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Notatki i wydatki</h1>
          <p className="text-sm text-zinc-500">
            {isAdmin ? 'Wszystkie zgłoszone wydatki wszystkich instalatorów.' : 'Zgłoś tankowanie, zakup materiałów z własnych środków lub inny koszt.'}
          </p>
        </div>
        <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
          <Plus className="mr-1 h-4 w-4" /> Nowa notatka
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-2.5">Typ</th>
              {isAdmin && <th className="px-4 py-2.5">Instalator</th>}
              <th className="px-4 py-2.5">Kwota</th>
              <th className="px-4 py-2.5">Opis / Pojazd</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Paragon</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => {
              const meta = TYPE_META[n.type];
              const Icon = meta.icon;
              return (
                <tr key={n.id} className="border-b border-zinc-800 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                      <Icon className="h-3.5 w-3.5" /> {meta.label}
                    </span>
                  </td>
                  {isAdmin && <td className="px-4 py-2.5 text-zinc-300">{n.user?.firstName} {n.user?.lastName}</td>}
                  <td className="px-4 py-2.5 font-medium text-zinc-100">{n.amount.toFixed(2)} zł</td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {n.vehicle ? `${n.vehicle.brand} ${n.vehicle.model} (${n.vehicle.registrationNumber})` : (n.description || '—')}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{new Date(n.createdAt).toLocaleDateString('pl-PL')}</td>
                  <td className="px-4 py-2.5">
                    {n.receiptUrl ? (
                      <a href={n.receiptUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300">
                        <Receipt className="h-3.5 w-3.5" /> Zobacz
                      </a>
                    ) : <span className="text-xs text-zinc-600">—</span>}
                  </td>
                </tr>
              );
            })}
            {notes.length === 0 && (
              <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-zinc-500">Brak notatek</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowa notatka">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Rodzaj</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={fieldClass}>
            <option value="REFUELING">Tankowanie</option>
            <option value="MATERIAL_PURCHASE">Zakup materiałów z własnych środków</option>
            <option value="OTHER">Inny koszt</option>
          </select>

          {form.type === 'REFUELING' && (
            <>
              <label className={labelClass}>Pojazd</label>
              <select required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className={fieldClass}>
                {vehicles.length === 0 && <option value="">— brak pojazdów —</option>}
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.registrationNumber})</option>)}
              </select>
            </>
          )}

          <label className={labelClass}>Kwota (zł)</label>
          <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={fieldClass} />

          <label className={labelClass}>Opis (opcjonalnie)</label>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} />

          <label className={labelClass}>Zdjęcie paragonu / faktury (obowiązkowe)</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 py-4 text-sm text-zinc-400 hover:border-orange-600/50 hover:text-orange-400"
          >
            <Receipt className="h-4 w-4" /> {receiptBase64 ? 'Zmień zdjęcie' : 'Wybierz zdjęcie'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {receiptBase64 && (
            <img src={receiptBase64} alt="Podgląd paragonu" className="mt-2 h-24 w-24 rounded-lg border border-zinc-700 object-cover" />
          )}

          {formError && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{formError}</p>}

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
