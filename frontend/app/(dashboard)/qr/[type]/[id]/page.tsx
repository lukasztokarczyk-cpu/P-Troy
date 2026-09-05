'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

/**
 * Cel QR Code z etykiet (sekcja 6 specyfikacji) — po zeskanowaniu
 * użytkownik trafia tu, a stąd jest automatycznie przekierowywany do
 * właściwego miejsca w P-Troy (rozdzielnia, urządzenie, port...).
 * Kod QR koduje stabilne ID rekordu, nie nazwę — resolve() zawsze
 * wskazuje aktualną lokalizację, nawet jeśli element został przeniesiony.
 */
export default function QrRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const type = params.type as string;
    const id = params.id as string;
    apiClient<{ targetPath: string; displayName: string }>(`/api/labels/resolve/${type}/${id}`)
      .then((res) => router.replace(res.targetPath))
      .catch(() => setError('Element o tym kodzie nie został znaleziony — mógł zostać usunięty.'));
  }, [params, router]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-6 w-6 text-orange-500" />
        <p className="text-sm text-zinc-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
    </div>
  );
}
