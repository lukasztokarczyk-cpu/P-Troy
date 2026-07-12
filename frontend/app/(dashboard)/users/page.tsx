'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, UserX, Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface ManagedUser {
  id: string;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  color: string | null;
}

// Nazwa roli KIEROWNIK w bazie danych pozostaje niezmieniona (uniknięcie
// ryzykownej migracji na działającej bazie) — zmieniamy wyłącznie
// wyświetlaną etykietę na "Brygadzista" zgodnie z nową nomenklaturą.
const ROLE_OPTIONS = [
  { value: 'INSTALATOR', label: 'Instalator' },
  { value: 'MAGAZYNIER', label: 'Magazynier' },
  { value: 'KIEROWNIK', label: 'Brygadzista' },
  { value: 'ADMIN', label: 'Administrator' },
];
const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

// Stała paleta — gwarantuje wyraźnie odróżnialne kolory zamiast
// dowolnego selektora, gdzie łatwo o dwa bardzo zbliżone odcienie
const COLOR_PALETTE = [
  '#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#84cc16', '#06b6d4',
  '#a855f7', '#f43f5e',
];

const emptyForm = { firstName: '', lastName: '', login: '', email: '', password: '', role: 'INSTALATOR', color: '' };

export default function UsersPage() {
  const { user: currentUser, isLoading, workMode } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    apiClient<ManagedUser[]>('/api/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'ADMIN' && workMode === 'ADMIN') loadUsers();
  }, [currentUser, workMode, loadUsers]);

  const takenColors = new Set((users ?? []).filter((u) => u.color).map((u) => u.color));

  const openModal = () => {
    const firstFree = COLOR_PALETTE.find((c) => !takenColors.has(c)) || '';
    setForm({ ...emptyForm, color: firstFree });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (form.password.length < 8) {
      setFormError('Hasło musi mieć minimum 8 znaków.');
      return;
    }
    if (form.role === 'INSTALATOR' && !form.color) {
      setFormError('Kolor instalatora jest obowiązkowy.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient('/api/users', {
        method: 'POST',
        body: { ...form, color: form.role === 'INSTALATOR' ? form.color : undefined },
      });
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setFormError(err.message || 'Nie udało się utworzyć konta.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Dezaktywować to konto? Użytkownik nie będzie mógł się zalogować.')) return;
    await apiClient(`/api/users/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadUsers();
  };

  if (isLoading) return null;

  if (currentUser?.role !== 'ADMIN' || workMode !== 'ADMIN') {
    return <div className="flex h-64 items-center justify-center text-sm text-zinc-500">Ta sekcja jest dostępna wyłącznie dla administratora.</div>;
  }

  if (users === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Użytkownicy</h1>
          <p className="text-sm text-zinc-500">Zarządzanie kontami — w tym tworzenie kont dla instalatorów.</p>
        </div>
        <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
          <Plus className="mr-1 h-4 w-4" /> Nowe konto
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-2.5">Imię i nazwisko</th>
              <th className="px-4 py-2.5">Login</th>
              <th className="px-4 py-2.5">Rola</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-zinc-800 last:border-0">
                <td className="px-4 py-2.5 text-zinc-100">
                  {u.color && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: u.color }} />}
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-4 py-2.5 text-zinc-500">{u.login}</td>
                <td className="px-4 py-2.5 text-zinc-300">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? 'bg-emerald-900/30 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>
                    {u.isActive ? 'Aktywne' : 'Nieaktywne'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {u.isActive && u.id !== currentUser.id && (
                    <button onClick={() => handleDeactivate(u.id)} className="text-zinc-500 hover:text-red-400" title="Dezaktywuj konto">
                      <UserX className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Brak użytkowników</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowe konto" description="Utwórz konto — np. dla nowego instalatora.">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Imię</label>
              <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Nazwisko</label>
              <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <label className={labelClass}>Login (do logowania)</label>
          <input required value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="np. pkowalski" className={fieldClass} />

          <label className={labelClass}>E-mail</label>
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="np. p.kowalski@firma.pl" className={fieldClass} />

          <label className={labelClass}>Hasło startowe (min. 8 znaków)</label>
          <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={fieldClass} />

          <label className={labelClass}>Rola</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={fieldClass}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          {form.role === 'INSTALATOR' && (
            <>
              <label className={labelClass}>Kolor instalatora (obowiązkowy, unikalny)</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => {
                  const taken = takenColors.has(c);
                  const selected = form.color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={taken}
                      onClick={() => setForm({ ...form, color: c })}
                      title={taken ? 'Kolor już zajęty' : c}
                      className="relative h-8 w-8 rounded-full transition-transform disabled:cursor-not-allowed disabled:opacity-20"
                      style={{ backgroundColor: c, transform: selected ? 'scale(1.15)' : undefined, boxShadow: selected ? '0 0 0 2px #18181b, 0 0 0 4px ' + c : undefined }}
                    >
                      {selected && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {formError && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{formError}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Utwórz konto
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
