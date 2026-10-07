'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, UserX, UserCheck, Check, KeyRound, ShieldCheck, Pencil } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface ManagedUser {
  id: string;
  login: string;
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  color: string | null;
}

interface Tile {
  id: string;
  key: string;
  name: string;
  isEnabled: boolean;
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

// Domyślny zestaw modułów zaznaczany przy tworzeniu konta instalatora.
// „sites” (Budowy) jest tu obowiązkowo: bez niego instalator nie widzi swoich budów,
// a listy budów w harmonogramie i zadaniach dostają błąd 403.
const DEFAULT_INSTALLER_MODULES = ['sites', 'schedule', 'tasks', 'time-tracking'];

const emptyForm = {
  firstName: '', lastName: '', login: '', email: '', password: '', role: 'INSTALATOR', color: '',
  moduleKeys: DEFAULT_INSTALLER_MODULES,
};

export default function UsersPage() {
  const { user: currentUser, isLoading, workMode } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>([]);
  // edycja danych konta (imię, nazwisko, e-mail, telefon, kolor instalatora)
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', color: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [permTarget, setPermTarget] = useState<ManagedUser | null>(null);
  const [permKeys, setPermKeys] = useState<string[]>([]);
  const [permHasDirect, setPermHasDirect] = useState(true);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    apiClient<ManagedUser[]>('/api/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'ADMIN' && workMode === 'ADMIN') {
      loadUsers();
      apiClient<Tile[]>('/api/tiles').then((t) => setTiles(t.filter((x) => x.isEnabled))).catch(() => setTiles([]));
    }
  }, [currentUser, workMode, loadUsers]);

  const toggleKey = (keys: string[], key: string) =>
    keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];

  const toggleFormModule = (key: string) => setForm((f) => ({ ...f, moduleKeys: toggleKey(f.moduleKeys, key) }));

  const openPermissions = async (u: ManagedUser) => {
    setPermTarget(u);
    setPermKeys([]);
    setPermError(null);
    setPermLoading(true);
    try {
      const res = await apiClient<{ hasDirectGrants: boolean; moduleKeys: string[] }>(`/api/tiles/user/${u.id}`);
      setPermKeys(res.moduleKeys);
      setPermHasDirect(res.hasDirectGrants);
    } catch (err: any) {
      setPermError(err.message || 'Nie udało się pobrać uprawnień.');
    } finally {
      setPermLoading(false);
    }
  };

  const togglePermModule = (key: string) => setPermKeys((keys) => toggleKey(keys, key));

  const handleSavePermissions = async () => {
    if (!permTarget) return;
    if (permKeys.length === 0) {
      setPermError('Wybierz co najmniej jeden moduł.');
      return;
    }
    setPermSaving(true);
    setPermError(null);
    try {
      await apiClient(`/api/tiles/user/${permTarget.id}`, { method: 'PATCH', body: { moduleKeys: permKeys } });
      setPermTarget(null);
    } catch (err: any) {
      setPermError(err.message || 'Nie udało się zapisać uprawnień.');
    } finally {
      setPermSaving(false);
    }
  };

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
    const minPasswordLength = form.role === 'INSTALATOR' ? 10 : 8;
    if (form.password.length < minPasswordLength) {
      setFormError(
        form.role === 'INSTALATOR'
          ? 'Hasło instalatora musi mieć minimum 10 znaków (wymóg konta pocztowego).'
          : 'Hasło musi mieć minimum 8 znaków.',
      );
      return;
    }
    if (form.role === 'INSTALATOR' && !(/[a-z]/.test(form.password) && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password))) {
      setFormError('Hasło instalatora musi zawierać małą literę, wielką literę i cyfrę (wymóg konta pocztowego).');
      return;
    }
    if (form.role === 'INSTALATOR' && !form.color) {
      setFormError('Kolor instalatora jest obowiązkowy.');
      return;
    }
    if (form.role === 'INSTALATOR' && tiles.length > 0 && form.moduleKeys.length === 0) {
      setFormError('Wybierz co najmniej jeden moduł dostępny dla instalatora.');
      return;
    }
    setSubmitting(true);
    try {
      // moduleKeys nie należy do CreateUserDto (forbidNonWhitelisted) — wysyłamy osobno
      const { moduleKeys, ...account } = form;
      const created = await apiClient<{ id: string }>('/api/users', {
        method: 'POST',
        body: { ...account, color: form.role === 'INSTALATOR' ? form.color : undefined },
      });
      if (form.role === 'INSTALATOR' && tiles.length > 0) {
        try {
          await apiClient(`/api/tiles/user/${created.id}`, { method: 'PATCH', body: { moduleKeys } });
        } catch {
          alert('Konto zostało utworzone, ale nie udało się zapisać uprawnień do modułów. Ustaw je przyciskiem „Uprawnienia” w wierszu konta.');
        }
      }
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setFormError(err.message || 'Nie udało się utworzyć konta.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (u: ManagedUser) => {
    setEditTarget(u);
    setEditForm({ firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone ?? '', color: u.color ?? '' });
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const f = editForm;
    if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim()) { setEditError('Imię, nazwisko i e-mail są wymagane.'); return; }
    if (editTarget.role === 'INSTALATOR' && !f.color) { setEditError('Kolor instalatora jest obowiązkowy.'); return; }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const body: Record<string, string> = { firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim() };
      if (f.phone.trim() || editTarget.phone) body.phone = f.phone.trim();
      if (editTarget.role === 'INSTALATOR') body.color = f.color;
      await apiClient(`/api/users/${editTarget.id}`, { method: 'PATCH', body });
      setEditTarget(null);
      loadUsers();
    } catch (err: any) {
      setEditError(err.message || 'Nie udało się zapisać zmian.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleActivate = async (u: ManagedUser) => {
    if (!window.confirm(`Aktywować konto ${u.firstName} ${u.lastName}? Użytkownik znów będzie mógł się zalogować.`)) return;
    await apiClient(`/api/users/${u.id}`, { method: 'PATCH', body: { isActive: true } }).catch((err) => alert(err.message));
    loadUsers();
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Dezaktywować to konto? Użytkownik nie będzie mógł się zalogować.')) return;
    await apiClient(`/api/users/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadUsers();
  };

  const openPasswordModal = (u: ManagedUser) => {
    setPasswordTarget(u);
    setNewPassword('');
    setPasswordError(null);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    const targetIsInstaller = passwordTarget?.role === 'INSTALATOR';
    const minLen = targetIsInstaller ? 10 : 8;
    if (newPassword.length < minLen) {
      setPasswordError(
        targetIsInstaller
          ? 'Hasło instalatora musi mieć minimum 10 znaków (wymóg konta pocztowego).'
          : 'Hasło musi mieć minimum 8 znaków.',
      );
      return;
    }
    if (targetIsInstaller && !(/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword))) {
      setPasswordError('Hasło instalatora musi zawierać małą literę, wielką literę i cyfrę (wymóg konta pocztowego).');
      return;
    }
    setPasswordSubmitting(true);
    try {
      await apiClient(`/api/users/${passwordTarget!.id}/password`, {
        method: 'PATCH',
        body: { newPassword },
      });
      setPasswordTarget(null);
    } catch (err: any) {
      setPasswordError(err.message || 'Nie udało się ustawić hasła.');
    } finally {
      setPasswordSubmitting(false);
    }
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

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[560px] text-sm">
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
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(u)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-orange-400" title="Edytuj dane konta">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {u.role !== 'ADMIN' && (
                      <button onClick={() => openPermissions(u)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-orange-400" title="Uprawnienia do modułów">
                        <ShieldCheck className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => openPasswordModal(u)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-orange-400" title="Zmień hasło">
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {u.isActive && u.id !== currentUser.id && (
                      <button onClick={() => handleDeactivate(u.id)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400" title="Dezaktywuj konto">
                        <UserX className="h-4 w-4" />
                      </button>
                    )}
                    {!u.isActive && (
                      <button onClick={() => handleActivate(u)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-emerald-400" title="Aktywuj konto">
                        <UserCheck className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Brak użytkowników</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowe konto" description="Utwórz konto — np. dla nowego instalatora." closeOnOverlayClick={false}>
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

          <label className={labelClass}>
            Hasło startowe (min. {form.role === 'INSTALATOR' ? '10 znaków, wielka/mała litera i cyfra' : '8 znaków'})
          </label>
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

          {form.role === 'INSTALATOR' && tiles.length > 0 && (
            <>
              <div className="mt-3 flex items-center justify-between">
                <label className={labelClass}>Dostępne moduły/kafelki ({form.moduleKeys.length}/{tiles.length})</label>
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={() => setForm({ ...form, moduleKeys: tiles.map((t) => t.key) })} className="text-orange-400 hover:underline">Zaznacz wszystkie</button>
                  <button type="button" onClick={() => setForm({ ...form, moduleKeys: [] })} className="text-zinc-500 hover:underline">Odznacz wszystkie</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tiles.map((t) => (
                  <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-700">
                    <input type="checkbox" checked={form.moduleKeys.includes(t.key)} onChange={() => toggleFormModule(t.key)} className="accent-orange-500" />
                    {t.name}
                  </label>
                ))}
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

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edytuj konto"
        description={editTarget ? `Login: ${editTarget.login} — rola i login nie zmieniają się w tym oknie.` : ''}
        closeOnOverlayClick={false}
      >
        <form onSubmit={handleEditSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Imię</label>
              <input required value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Nazwisko</label>
              <input required value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} className={fieldClass} />
            </div>
          </div>
          <label className={labelClass}>E-mail</label>
          <input required type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={fieldClass} />
          <label className={labelClass}>Telefon</label>
          <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className={fieldClass} placeholder="opcjonalnie" />

          {editTarget?.role === 'INSTALATOR' && (
            <>
              <label className={labelClass}>Kolor instalatora (unikalny)</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => {
                  const takenByOther = (users ?? []).some((x) => x.id !== editTarget.id && x.color === c);
                  const selected = editForm.color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={takenByOther}
                      onClick={() => setEditForm({ ...editForm, color: c })}
                      title={takenByOther ? 'Kolor już zajęty' : c}
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

          {editError && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{editError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={editSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {editSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!permTarget}
        onClose={() => setPermTarget(null)}
        title="Uprawnienia do modułów"
        description={permTarget ? `Moduły dostępne dla ${permTarget.firstName} ${permTarget.lastName} (${permTarget.login}).` : ''}
        closeOnOverlayClick={false}
      >
        {permLoading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-zinc-300">Dostępne moduły: {permKeys.length}/{tiles.length}</span>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => setPermKeys(tiles.map((t) => t.key))} className="text-orange-400 hover:underline">Zaznacz wszystkie</button>
                <button type="button" onClick={() => setPermKeys([])} className="text-zinc-500 hover:underline">Odznacz wszystkie</button>
              </div>
            </div>
            {!permHasDirect && (
              <p className="mb-2 rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
                To konto korzysta teraz z uprawnień wynikających z roli. Zapis ustawi dla niego indywidualną listę modułów.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {tiles.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-700">
                  <input type="checkbox" checked={permKeys.includes(t.key)} onChange={() => togglePermModule(t.key)} className="accent-orange-500" />
                  {t.name}
                </label>
              ))}
            </div>

            {permError && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{permError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPermTarget(null)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
              <Button type="button" onClick={handleSavePermissions} disabled={permSaving} className="bg-orange-600 text-white hover:bg-orange-500">
                {permSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!passwordTarget}
        onClose={() => setPasswordTarget(null)}
        title="Zmień hasło"
        description={passwordTarget ? `Ustaw nowe hasło dla ${passwordTarget.firstName} ${passwordTarget.lastName} (${passwordTarget.login}).` : ''}
      >
        <form onSubmit={handleSetPassword}>
          <label className={labelClass}>
            Nowe hasło (min. {passwordTarget?.role === 'INSTALATOR' ? '10 znaków, wielka/mała litera i cyfra' : '8 znaków'})
          </label>
          <input
            required
            type="password"
            autoFocus
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={fieldClass}
          />

          {passwordError && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{passwordError}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPasswordTarget(null)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={passwordSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {passwordSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Ustaw hasło
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
