'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    apiClient<Record<string, string>>('/api/settings')
      .then((s) => { setSettings(s); setCompanyName(s['company.name'] || ''); })
      .catch(() => setSettings({}));
  }, [user]);

  const handleSave = async () => {
    await apiClient('/api/settings', { method: 'PATCH', body: { 'company.name': companyName } }).catch((err) => alert(err.message));
    alert('Ustawienia zapisane');
  };

  if (isLoading) return null;

  if (user?.role !== 'ADMIN') {
    return <div className="flex h-64 items-center justify-center text-sm text-zinc-500">Ta sekcja jest dostępna wyłącznie dla administratora.</div>;
  }

  if (settings === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Ustawienia</h1>
        <p className="text-sm text-zinc-500">Dostęp wyłącznie dla administratora.</p>
      </div>

      <div className="max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <label className="mb-1.5 block text-xs text-zinc-500">Nazwa firmy</label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="ERP Elektryk"
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
        />
        <Button onClick={handleSave} className="bg-orange-600 text-white hover:bg-orange-500">
          <Save className="mr-1 h-4 w-4" /> Zapisz ustawienia
        </Button>
      </div>
    </div>
  );
}
