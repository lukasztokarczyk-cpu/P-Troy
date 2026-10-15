'use client';

import Link from 'next/link';
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES, formatDateTime, type OrderListItem, type OrderStatus } from '@/lib/orders';

export function OrderStatusChip({ status }: { status: string }) {
  const s = status as OrderStatus;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${ORDER_STATUS_STYLES[s] ?? ORDER_STATUS_STYLES.DRAFT}`}>{ORDER_STATUS_LABELS[s] ?? status}</span>;
}

/** Tabela na komputerze, karty na telefonie (oba w DOM, przełącza je CSS). */
export function OrderList({ items, showAuthor }: { items: OrderListItem[]; showAuthor: boolean }) {
  if (items.length === 0) return <p className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500" data-testid="orders-empty">Brak zamówień.</p>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 md:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2">Numer</th>
              <th className="px-3 py-2">Budowa</th>
              {showAuthor && <th className="px-3 py-2">Zamawiający</th>}
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Poz.</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="border-t border-zinc-800 hover:bg-zinc-900/60" data-testid="order-row">
                <td className="px-3 py-2"><Link href={`/orders/${o.id}`} className="font-medium text-orange-400 hover:underline">{o.number}</Link></td>
                <td className="px-3 py-2 text-zinc-200">{o.siteName}{o.address && <span className="block text-xs text-zinc-500">{o.address}</span>}</td>
                {showAuthor && <td className="px-3 py-2 text-zinc-300">{o.createdByName}</td>}
                <td className="px-3 py-2 text-zinc-300">{formatDateTime(o.submittedAt ?? o.createdAt)}</td>
                <td className="px-3 py-2 text-zinc-300">{o.itemCount}</td>
                <td className="px-3 py-2"><OrderStatusChip status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {items.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 active:bg-zinc-800" data-testid="order-card">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-orange-400">{o.number}</span>
                <OrderStatusChip status={o.status} />
              </div>
              <p className="mt-1 text-sm text-zinc-200">{o.siteName}</p>
              <p className="text-xs text-zinc-500">{formatDateTime(o.submittedAt ?? o.createdAt)} · {o.itemCount} poz.</p>
              {showAuthor && <p className="text-xs text-zinc-500">{o.createdByName}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
