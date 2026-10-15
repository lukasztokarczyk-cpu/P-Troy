'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { errorMessage } from '@/lib/protocols';
import type { OrderDetail } from '@/lib/orders';
import { OrderBuilder } from '@/components/orders/OrderBuilder';
import { OrderView } from '@/components/orders/OrderView';

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiClient<OrderDetail>(`/api/orders/${id}`).then(setOrder).catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-sm text-red-300">{error}</p>
        <Link href="/orders" className="mt-3 inline-block text-sm text-orange-400 hover:underline">Wróć do listy zamówień</Link>
      </div>
    );
  }
  if (!order) return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;

  // Własna wersja robocza otwiera się od razu w edytorze
  if (order.status === 'DRAFT' && order.permissions.canEditItems) return <OrderBuilder initial={order} />;
  return (
    <div>
      <div className="mx-auto max-w-4xl px-4 pt-4"><Link href="/orders" className="text-sm text-zinc-400 hover:text-zinc-200">← Lista zamówień</Link></div>
      <OrderView order={order} onChanged={setOrder} />
    </div>
  );
}
