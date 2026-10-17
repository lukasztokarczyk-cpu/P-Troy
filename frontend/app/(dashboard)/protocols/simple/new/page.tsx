'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { SimpleProtocolForm } from '@/components/protocols/SimpleProtocolForm';

function NewSimple() {
  const params = useSearchParams();
  const [defaults, setDefaults] = useState<string[] | null>(null);
  useEffect(() => {
    apiClient<{ items: string[] }>('/api/simple-protocols/defaults').then((d) => setDefaults(d.items)).catch(() => setDefaults([]));
  }, []);
  if (defaults === null) return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  return <SimpleProtocolForm presetSiteId={params.get('siteId') ?? undefined} defaults={defaults} />;
}

export default function NewSimpleProtocolPage() {
  return <Suspense fallback={<div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>}><NewSimple /></Suspense>;
}
