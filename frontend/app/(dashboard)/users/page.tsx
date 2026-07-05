'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, UserX } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

interface ManagedUser {
  id: string;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator', KIEROWNIK: 'Kierownik', INSTALATOR: 'Instalator', MAGAZYNIER: 'Magazynier',
};

// Zarządzanie kontami — w szczególności tworzenie kont dla instalatorów.
// Cała logika uprawnień jest egzekwowana po stronie backendu
// (UsersController jest dostępny wyłącznie dla roli ADMIN), ta strona
// jest tylko interfejsem do tego API.
export default function UsersPage() {
  const { user: currentUser, isLoading } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);

  const loadUsers = useCallback(() => {
    apiClient<ManagedUser[]>('/api/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') loadUsers();
  }, [currentUser, loadUsers]);

  const handleCreate = async () => {
    const firstName = window.prompt('Imię:');
    if (!firstName) return;
    const lastName = window.prompt('Nazwisko:') || '';
    const login = window.prompt('Login (do logowania):') || '';
    const email = window.prompt('E-mail:') || `${login}@firma.pl`;
    const password = window.prompt('Hasło startowe (min. 8 znaków):') || '';
    const role = window.prompt('Rola: ADMIN / KIEROWNIK / INSTALATOR / MAGAZYNIER', 'INSTALATOR') || 'INSTALATOR';

    if (!login || password.length < 8) {
      alert('Login jest wymagany, a hasło musi mieć min. 8 znaków.');
      return;
    }

    await apiClient('/api/users', {
      method: 'POST',
      body: { firstName, lastName, login, email, password, role },
    }).catch((err) => alert(err.message));
    loadUsers();
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Dezaktywować to konto? Użytkownik nie będzie mógł się zalogować.')) return;
    await apiClient(`/api/users/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadUsers();
  };

  if (isLoading) return null;

  if (currentUser?.role !== 'ADMIN') {
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
        <Button onClick={handleCreate} className="bg-orange-600 text-white hover:bg-orange-500">
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
                <td className="px-4 py-2.5 text-zinc-100">{u.firstName} {u.lastName}</td>
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
    </div>
  );
}
