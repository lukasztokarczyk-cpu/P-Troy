'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare, Pencil, Printer, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { errorMessage, type UploadPayload } from '@/lib/protocols';
import { CHANGEABLE_STATUSES, ORDER_STATUS_LABELS, fmtQty, formatDateTime, type OrderDetail, type OrderStatus } from '@/lib/orders';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { inputCls } from '@/components/protocols/ProtocolInputs';
import { openPdf } from '@/components/protocols/ProtocolModals';
import { OrderStatusChip } from './OrderParts';
import { OrderBuilder, PhotoStrip } from './OrderBuilder';

const EVENT_TITLES: Record<string, string> = {
  CREATED: 'Utworzono',
  SUBMITTED: 'Wysłano',
  STATUS: 'Zmiana statusu',
  EDIT: 'Zmiana w zamówieniu',
  COMMENT: 'Komentarz',
};

/** Podgląd zamówienia: pozycje, zdjęcia, historia + akcje zależne od uprawnień (z backendu). */
export function OrderView({ order, onChanged }: { order: OrderDetail; onChanged: (o: OrderDetail) => void }) {
  const router = useRouter();
  const p = order.permissions;
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState<OrderStatus>(order.status === 'DRAFT' ? 'SENT' : order.status);
  const [statusComment, setStatusComment] = useState('');
  const [comment, setComment] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [withPhotos, setWithPhotos] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const reload = async () => onChanged(await apiClient<OrderDetail>(`/api/orders/${order.id}`));

  if (editing) {
    return <OrderBuilder initial={order} mode="edit-sent" onSaved={(o) => { onChanged(o); setEditing(false); }} onCancel={() => setEditing(false)} />;
  }

  const changeStatus = () =>
    run('status', async () => {
      onChanged(await apiClient<OrderDetail>(`/api/orders/${order.id}/status`, { method: 'POST', body: { status, ...(statusComment.trim() ? { comment: statusComment.trim() } : {}) } }));
      setStatusComment('');
    });

  const sendComment = () =>
    run('comment', async () => {
      if (!comment.trim()) return;
      onChanged(await apiClient<OrderDetail>(`/api/orders/${order.id}/comments`, { method: 'POST', body: { message: comment.trim() } }));
      setComment('');
    });

  const print = () =>
    run('print', async () => {
      const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
      try {
        const res = await apiClient<{ pdfUrl: string; fileName: string }>(`/api/orders/${order.id}/print`, { method: 'POST', body: { includePhotos: withPhotos } });
        openPdf(res.pdfUrl, win);
        setPrintOpen(false);
      } catch (e) {
        win?.close();
        throw e;
      }
    });

  const uploadPhoto = (itemId: string | null) => async (pl: UploadPayload) => {
    await run('photo', async () => {
      await apiClient(`/api/orders/${order.id}/photos`, { method: 'POST', body: { fileName: pl.fileName, base64: pl.base64, ...(itemId ? { itemId } : {}) } });
      await reload();
    });
  };

  const removePhoto = (photoId: string) =>
    run('photo', async () => {
      await apiClient(`/api/orders/${order.id}/photos/${photoId}`, { method: 'DELETE' });
      await reload();
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-4" data-testid="order-view">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{order.number}</h1>
          <p className="mt-0.5 text-sm text-zinc-300">{order.site.name}{order.site.address && <span className="text-zinc-500"> · {order.site.address}</span>}</p>
          <p className="text-xs text-zinc-500">{order.createdBy.name} · {formatDateTime(order.submittedAt ?? order.createdAt)}</p>
        </div>
        <OrderStatusChip status={order.status} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {p.canPrint && <Button variant="outline" className="h-11" onClick={() => setPrintOpen(true)} data-testid="print-btn"><Printer className="mr-2 h-4 w-4" />Drukuj listę dla hurtowni</Button>}
        {p.canEditItems && order.status !== 'DRAFT' && <Button variant="outline" className="h-11" onClick={() => setEditing(true)} data-testid="edit-btn"><Pencil className="mr-2 h-4 w-4" />Edytuj pozycje</Button>}
        {p.canDelete && <Button variant="outline" className="h-11 text-red-300" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-2 h-4 w-4" />Usuń</Button>}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-950/50 p-3 text-sm text-red-300" role="alert">{error}</p>}

      {order.note && <p className="mb-4 whitespace-pre-line rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300"><span className="block text-xs text-zinc-500">Uwagi</span>{order.note}</p>}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-100">Materiały ({order.items.length})</h2>
        <ul className="space-y-2">
          {order.items.map((it, idx) => (
            <li key={it.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3" data-testid="view-item">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{idx + 1}. {it.name}{it.isCustom && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">własny</span>}</p>
                  {it.spec && <p className="text-xs text-zinc-500">{it.spec}</p>}
                  {it.note && <p className="text-xs text-zinc-400">Uwaga: {it.note}</p>}
                </div>
                <p className="shrink-0 text-sm font-semibold text-orange-300">{fmtQty(it.quantity)} {it.unit}</p>
              </div>
              {(it.photos.length > 0 || p.canAddPhotos) && (
                <PhotoStrip existing={it.photos} pending={[]} onAdd={p.canAddPhotos ? uploadPhoto(it.id) : undefined} onRemoveExisting={p.canAddPhotos ? (ph) => removePhoto(ph.id) : undefined} readOnly={!p.canAddPhotos} label={`pozycji ${idx + 1}`} />
              )}
            </li>
          ))}
        </ul>
        {(order.orderPhotos.length > 0 || p.canAddPhotos) && (
          <div className="mt-3">
            <p className="text-xs text-zinc-400">Zdjęcia do całego zamówienia</p>
            <PhotoStrip existing={order.orderPhotos} pending={[]} onAdd={p.canAddPhotos ? uploadPhoto(null) : undefined} onRemoveExisting={p.canAddPhotos ? (ph) => removePhoto(ph.id) : undefined} readOnly={!p.canAddPhotos} label="zamówienia" />
          </div>
        )}
      </section>

      {p.canChangeStatus && (
        <section className="mb-6 rounded-xl border border-zinc-800 p-3" data-testid="status-box">
          <h2 className="mb-2 text-sm font-semibold text-zinc-100">Zmień status</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr_auto]">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} aria-label="Nowy status">
              {CHANGEABLE_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
            </select>
            <input className={inputCls} placeholder="Komentarz (opcjonalnie)" value={statusComment} onChange={(e) => setStatusComment(e.target.value)} aria-label="Komentarz do statusu" />
            <Button className="h-11" onClick={changeStatus} disabled={!!busy || status === order.status} data-testid="status-apply">{busy === 'status' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zmień'}</Button>
          </div>
        </section>
      )}

      <section data-testid="history">
        <h2 className="mb-2 text-sm font-semibold text-zinc-100">Historia</h2>
        <ul className="space-y-2">
          {[...order.events].reverse().map((e) => (
            <li key={e.id} className="rounded-lg border border-zinc-800 p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span>{EVENT_TITLES[e.type] ?? e.type} · {e.userName}</span>
                <span>{formatDateTime(e.createdAt)}</span>
              </div>
              {e.type === 'STATUS' && e.toStatus && <p className="mt-0.5 text-zinc-200">{e.fromStatus ? `${ORDER_STATUS_LABELS[e.fromStatus]} → ` : ''}<b>{ORDER_STATUS_LABELS[e.toStatus]}</b></p>}
              {e.message && <p className="mt-0.5 whitespace-pre-line text-zinc-300">{e.message}</p>}
            </li>
          ))}
        </ul>
        {p.canComment && (
          <div className="mt-3 flex gap-2">
            <input className={inputCls} placeholder="Dodaj komentarz…" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Komentarz" />
            <Button className="h-11" onClick={sendComment} disabled={!!busy || !comment.trim()} data-testid="comment-send"><MessageSquare className="mr-1.5 h-4 w-4" />Wyślij</Button>
          </div>
        )}
      </section>

      <Modal open={printOpen} onClose={() => setPrintOpen(false)} title="Drukuj listę dla hurtowni" description={`${order.number} — PDF A4`} closeOnOverlayClick={false}>
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-zinc-200">
          <input type="checkbox" className="h-5 w-5" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
          Dołącz zdjęcia na końcu dokumentu
        </label>
        <p className="mt-1 text-xs text-zinc-500">Lista zawiera numer, budowę, datę oraz pozycje z ilościami i uwagami — bez cen.</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => setPrintOpen(false)}>Anuluj</Button>
          <Button className="h-11 flex-1" onClick={print} disabled={!!busy} data-testid="print-run">{busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generuj PDF'}</Button>
        </div>
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Usunąć wersję roboczą?" closeOnOverlayClick={false}>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => setConfirmDelete(false)}>Anuluj</Button>
          <Button variant="destructive" className="h-11 flex-1" onClick={() => run('delete', async () => { await apiClient(`/api/orders/${order.id}`, { method: 'DELETE' }); router.push('/orders'); })}>Usuń</Button>
        </div>
      </Modal>
    </div>
  );
}
