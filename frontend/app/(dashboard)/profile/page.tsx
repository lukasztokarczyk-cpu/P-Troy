'use client';

import { useState } from 'react';
import { KeyRound, User, Save, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator', KIEROWNIK: 'Brygadzista', INSTALATOR: 'Instalator', MAGAZYNIER: 'Magazynier',
};

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      await apiClient('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      setMessage('Hasło zostało zmienione.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setMessage(err.message || 'Nie udało się zmienić hasła.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !user) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Mój profil</h1>
        <p className="text-sm text-zinc-500">Dane konta i zmiana hasła.</p>
      </div>

      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <User className="h-4 w-4 text-orange-500" /> Dane konta
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Imię i nazwisko</dt><dd className="text-zinc-200">{user.firstName} {user.lastName}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Login</dt><dd className="text-zinc-200">{user.login}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Rola</dt><dd className="text-zinc-200">{ROLE_LABELS[user.role] ?? user.role}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <KeyRound className="h-4 w-4 text-orange-500" /> Zmiana hasła
          </div>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Aktualne hasło"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Nowe hasło (min. 8 znaków)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
            />
            {message && <p className="text-xs text-zinc-400">{message}</p>}
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              <Save className="mr-1 h-4 w-4" /> Zapisz nowe hasło
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
