'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Moduł „Pomiary” został przebudowany na „Protokoły” — stare linki i zakładki trafiają tutaj i są przekierowywane. */
export default function MeasurementsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/protocols');
  }, [router]);
  return (
    <div className="flex justify-center p-12">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  );
}
