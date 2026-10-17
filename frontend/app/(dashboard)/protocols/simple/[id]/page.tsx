'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { errorMessage } from '@/lib/protocols';
import type { SimpleProtocolDetail } from '@/lib/simple-protocols';
import { SimpleProtocolForm } from '@/components/protocols/SimpleProtocolForm';

export default function SimpleProtocolPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SimpleProtocolDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiClient<SimpleProtocolDetail>(`/api/simple-protocols/${id}`).then(setData).catch((e) => setError(errorMessage(e))); }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-sm text-red-300">{error}</p>
        <Link href="/protocols" className="mt-3 inline-block text-sm text-orange-400 hover:underline">Wróć do protokołów</Link>
      </div>
    );
  }
  if (!data) return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  return <SimpleProtocolForm initial={data} />;
}
