'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Send, Trash2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { errorMessage, type UploadPayload } from '@/lib/protocols';
import {
  type DraftItem, type DraftPhoto, type OrderDetail, type OrderPhotoView, type SiteOption,
  UNIT_OPTIONS, itemFromView, newClientToken, newKey, toPayloadItems, validateDraftItems,
} from '@/lib/orders';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FieldLabel, PhotoButton, inputCls } from '@/components/protocols/ProtocolInputs';
import { CatalogPicker } from './CatalogPicker';

const MAX_BYTES = 10 * 1024 * 1024;

/** Sprawdza typ i rozmiar zdjęcia przed dodaniem do zamówienia (backend i tak weryfikuje to ponownie). */
function checkPhoto(p: UploadPayload): string | null {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(p.base64)) return 'Dozwolone są tylko zdjęcia JPG, PNG lub WebP.';
  if (p.base64.length * 0.75 > MAX_BYTES) return 'Zdjęcie jest za duże (maks. 10 MB).';
  return null;
}

type Mode = 'draft' | 'edit-sent';

/**
 * Edytor zamówienia: wersja robocza (nowa lub istniejąca) albo korekta wysłanego zamówienia przez administratora.
 * Zdjęcia dodane przed zapisem czekają w pamięci i są wysyłane po zapisie zamówienia —
 * błąd wysyłki zdjęcia NIE blokuje wysłania zamówienia.
 */
export function OrderBuilder({ initial, mode = 'draft', onSaved, onCancel }: { initial?: OrderDetail; mode?: Mode; onSaved?: (o: OrderDetail) => void; onCancel?: () => void }) {
  const router = useRouter();
  const token = useRef(newClientToken());
  const submitting = useRef(false);

  const [sites, setSites] = useState<SiteOption[] | null>(null);
  const [siteId, setSiteId] = useState(initial?.site.id ?? '');
  const [orderId, setOrderId] = useState<string | undefined>(initial?.id);
  const [note, setNote] = useState(initial?.note ?? '');
  const [items, setItems] = useState<DraftItem[]>(() => (initial ? initial.items.map(itemFromView) : []));
  const [orderPhotos, setOrderPhotos] = useState<OrderPhotoView[]>(initial?.orderPhotos ?? []);
  const [pendingOrderPhotos, setPendingOrderPhotos] = useState<DraftPhoto[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'submit'>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [info, setInfo] = useState('');
  const [done, setDone] = useState<null | { number: string }>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    apiClient<SiteOption[]>('/api/orders/sites')
      .then((s) => {
        setSites(s);
        if (!initial && s.length === 1) setSiteId(s[0].id);
      })
      .catch((e) => { setSites([]); setError(errorMessage(e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchItem = (key: string, patch: Partial<DraftItem>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const addPhoto = async (p: UploadPayload, target: 'order' | string) => {
    const bad = checkPhoto(p);
    if (bad) return setError(bad);
    setError('');
    const ph: DraftPhoto = { key: newKey(), fileName: p.fileName, base64: p.base64, preview: p.base64 };
    if (target === 'order') setPendingOrderPhotos((l) => [...l, ph]);
    else setItems((l) => l.map((i) => (i.key === target ? { ...i, pending: [...i.pending, ph] } : i)));
  };

  const removeExisting = async (photo: OrderPhotoView, itemKey?: string) => {
    if (!orderId) return;
    try {
      await apiClient(`/api/orders/${orderId}/photos/${photo.id}`, { method: 'DELETE' });
      if (itemKey) setItems((l) => l.map((i) => (i.key === itemKey ? { ...i, photos: i.photos.filter((p) => p.id !== photo.id) } : i)));
      else setOrderPhotos((l) => l.filter((p) => p.id !== photo.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const problems = validateDraftItems(items, mode === 'edit-sent');

  /** Zapis zamówienia + wysyłka oczekujących zdjęć. Zwraca świeży stan z serwera. */
  const persist = useCallback(async (): Promise<{ order: OrderDetail; failedPhotos: number }> => {
    const body = { siteId, note, items: toPayloadItems(items) };
    let order: OrderDetail;
    if (orderId) order = await apiClient<OrderDetail>(`/api/orders/${orderId}`, { method: 'PUT', body: mode === 'edit-sent' ? { note, items: body.items } : body });
    else order = await apiClient<OrderDetail>('/api/orders', { method: 'POST', body: { ...body, clientToken: token.current } });
    setOrderId(order.id);

    // Pozycje wracają z serwera w tej samej kolejności — dopasowujemy po indeksie.
    let failed = 0;
    const uploads: { itemIndex: number | null; photo: DraftPhoto }[] = [
      ...items.flatMap((it, idx) => it.pending.map((photo) => ({ itemIndex: idx, photo }))),
      ...pendingOrderPhotos.map((photo) => ({ itemIndex: null, photo })),
    ];
    const uploaded = new Set<string>();
    for (const u of uploads) {
      try {
        await apiClient(`/api/orders/${order.id}/photos`, {
          method: 'POST',
          body: { fileName: u.photo.fileName, base64: u.photo.base64, ...(u.itemIndex !== null ? { itemId: order.items[u.itemIndex]?.id } : {}) },
        });
        uploaded.add(u.photo.key);
      } catch {
        failed++;
      }
    }
    const fresh = uploads.length ? await apiClient<OrderDetail>(`/api/orders/${order.id}`).catch(() => order) : order;
    // Po zapisie: pozycje z identyfikatorami z serwera; zdjęcia, których nie udało się wysłać, zostają w kolejce.
    setItems(
      fresh.items.map((fi, idx) => {
        const local = items[idx];
        return { ...itemFromView(fi), key: local?.key ?? fi.id, pending: (local?.pending ?? []).filter((p) => !uploaded.has(p.key)) };
      }),
    );
    setOrderPhotos(fresh.orderPhotos);
    setPendingOrderPhotos((l) => l.filter((p) => !uploaded.has(p.key)));
    return { order: fresh, failedPhotos: failed };
  }, [siteId, note, items, orderId, pendingOrderPhotos, mode]);

  const save = async () => {
    if (busy) return;
    setError(''); setWarning(''); setInfo('');
    if (!siteId && mode === 'draft') return setError('Wybierz budowę.');
    if (mode === 'draft') {
      const own = validateDraftItems(items, false);
      if (own.length) return setError(own[0]);
    } else if (problems.length) return setError(problems[0]);
    setBusy('save');
    try {
      const { order, failedPhotos } = await persist();
      if (failedPhotos) setWarning(`Nie udało się wysłać zdjęć: ${failedPhotos}. Zamówienie zapisane — spróbuj dodać je ponownie.`);
      setInfo(mode === 'edit-sent' ? 'Zmiany zapisane.' : 'Zapisano wersję roboczą.');
      onSaved?.(order);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (busy || submitting.current) return;
    setError(''); setWarning(''); setInfo('');
    if (!siteId) return setError('Wybierz budowę.');
    const toSend = validateDraftItems(items, true);
    if (toSend.length) return setError(toSend[0]);
    submitting.current = true;
    setBusy('submit');
    try {
      const { order, failedPhotos } = await persist();
      const sent = await apiClient<OrderDetail>(`/api/orders/${order.id}/submit`, { method: 'POST' });
      if (failedPhotos) setWarning(`Zamówienie wysłane, ale nie wszystkie zdjęcia (${failedPhotos}) dotarły — dodaj je w szczegółach zamówienia.`);
      setDone({ number: sent.number });
    } catch (e) {
      setError(errorMessage(e));
      submitting.current = false;
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center" data-testid="order-sent">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
        <h2 className="mt-3 text-lg font-semibold text-white">Zamówienie zostało wysłane do administratora</h2>
        <p className="mt-1 text-sm text-zinc-400">Numer: {done.number}</p>
        {warning && <p className="mt-3 rounded-lg bg-amber-950/40 p-2 text-xs text-amber-300">{warning}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button className="h-11" onClick={() => router.push('/orders')}>Wróć do listy</Button>
          <Button variant="outline" className="h-11" onClick={() => router.push('/orders/new')}>Nowe zamówienie</Button>
        </div>
      </div>
    );
  }

  const noSites = sites !== null && sites.length === 0 && !initial;
  const siteLabel = sites?.find((s) => s.id === siteId) ?? (initial ? initial.site : null);
  const canPickSite = mode === 'draft' && (sites?.length ?? 0) > 1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4" data-testid="order-builder">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">{mode === 'edit-sent' ? `Edycja ${initial?.number}` : initial ? `Wersja robocza ${initial.number}` : 'Nowe zamówienie'}</h1>
        {mode === 'draft' && <Link href="/orders" className="text-sm text-zinc-400 hover:text-zinc-200">Wróć</Link>}
      </div>

      {sites === null && <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>}

      {noSites && (
        <p className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200" data-testid="no-site">
          Nie masz przypisanej budowy. Skontaktuj się z administratorem.
        </p>
      )}

      {sites !== null && !noSites && (
        <div className="space-y-5">
          <section>
            <FieldLabel>Budowa</FieldLabel>
            {canPickSite ? (
              <select className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Budowa">
                <option value="">— wybierz budowę —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>)}
              </select>
            ) : (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100" data-testid="site-fixed">
                {siteLabel ? <>{siteLabel.name}{siteLabel.address && <span className="block text-xs text-zinc-500">{siteLabel.address}</span>}</> : '—'}
              </p>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">Materiały ({items.length})</h2>
              <Button className="h-11" onClick={() => setPicker(true)} disabled={!siteId && mode === 'draft'} data-testid="add-material"><Plus className="mr-1.5 h-4 w-4" />{items.length ? 'Dodaj kolejny materiał' : 'Dodaj materiał'}</Button>
            </div>
            {!siteId && mode === 'draft' && <p className="mb-2 text-xs text-zinc-500">Najpierw wybierz budowę.</p>}
            {items.length === 0 && <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">Lista jest pusta. Dodaj materiał z katalogu albo własny.</p>}
            <ul className="space-y-3">
              {items.map((it, idx) => (
                <li key={it.key} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3" data-testid="order-item">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100">{idx + 1}. {it.name}{it.isCustom && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">własny</span>}</p>
                      {it.isCustom && <input className={`${inputCls} mt-2`} value={it.name} onChange={(e) => patchItem(it.key, { name: e.target.value })} aria-label={`Nazwa pozycji ${idx + 1}`} />}
                    </div>
                    <button type="button" onClick={() => setConfirmDelete(idx)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-red-400" aria-label={`Usuń pozycję ${idx + 1}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <input className={`${inputCls} mt-2`} value={it.spec} onChange={(e) => patchItem(it.key, { spec: e.target.value })} placeholder="Specyfikacja (opcjonalnie)" aria-label={`Specyfikacja pozycji ${idx + 1}`} />
                  <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[120px_120px_1fr]">
                    <input className={inputCls} inputMode="decimal" value={it.quantity} onChange={(e) => patchItem(it.key, { quantity: e.target.value })} aria-label={`Ilość pozycji ${idx + 1}`} placeholder="Ilość" />
                    <select className={inputCls} value={it.unit} onChange={(e) => patchItem(it.key, { unit: e.target.value })} aria-label={`Jednostka pozycji ${idx + 1}`}>
                      {!UNIT_OPTIONS.includes(it.unit) && <option value={it.unit}>{it.unit}</option>}
                      {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input className={`${inputCls} col-span-2 sm:col-span-1`} value={it.note} onChange={(e) => patchItem(it.key, { note: e.target.value })} placeholder="Uwaga (opcjonalnie)" aria-label={`Uwaga do pozycji ${idx + 1}`} />
                  </div>
                  <PhotoStrip
                    existing={it.photos}
                    pending={it.pending}
                    onAdd={(p) => addPhoto(p, it.key)}
                    onRemoveExisting={(p) => removeExisting(p, it.key)}
                    onRemovePending={(k) => patchItem(it.key, { pending: it.pending.filter((p) => p.key !== k) })}
                    label={`pozycji ${idx + 1}`}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section>
            <FieldLabel hint="opcjonalnie">Uwagi do całego zamówienia</FieldLabel>
            <textarea className={`${inputCls} min-h-[80px]`} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Uwagi do zamówienia" />
            <div className="mt-3">
              <p className="mb-1 text-xs text-zinc-400">Zdjęcia do całego zamówienia (opcjonalnie)</p>
              <PhotoStrip
                existing={orderPhotos}
                pending={pendingOrderPhotos}
                onAdd={(p) => addPhoto(p, 'order')}
                onRemoveExisting={(p) => removeExisting(p)}
                onRemovePending={(k) => setPendingOrderPhotos((l) => l.filter((p) => p.key !== k))}
                label="zamówienia"
              />
            </div>
          </section>

          {error && <p className="flex items-start gap-2 rounded-lg bg-red-950/50 p-3 text-sm text-red-300" role="alert" data-testid="order-error"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
          {warning && <p className="rounded-lg bg-amber-950/40 p-3 text-sm text-amber-300">{warning}</p>}
          {info && <p className="rounded-lg bg-emerald-950/40 p-3 text-sm text-emerald-300" data-testid="order-info">{info}</p>}

          <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-zinc-800 bg-zinc-950/95 p-4 backdrop-blur sm:flex-row">
            {mode === 'draft' ? (
              <>
                <Button variant="outline" className="h-12 flex-1" onClick={save} disabled={!!busy} data-testid="save-draft">
                  {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Zapisz jako wersję roboczą
                </Button>
                <Button className="h-12 flex-1" onClick={submit} disabled={!!busy} data-testid="submit-order">
                  {busy === 'submit' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Wyślij zamówienie
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="h-12 flex-1" onClick={onCancel} disabled={!!busy}>Anuluj</Button>
                <Button className="h-12 flex-1" onClick={save} disabled={!!busy} data-testid="save-edit">
                  {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Zapisz zmiany
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <CatalogPicker open={picker} onClose={() => setPicker(false)} onAdd={(it) => setItems((l) => [...l, it])} />

      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Usunąć pozycję?" description={confirmDelete !== null ? items[confirmDelete]?.name : undefined} closeOnOverlayClick={false}>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => setConfirmDelete(null)}>Anuluj</Button>
          <Button variant="destructive" className="h-11 flex-1" onClick={() => { if (confirmDelete !== null) setItems((l) => l.filter((_, i) => i !== confirmDelete)); setConfirmDelete(null); }}>Usuń</Button>
        </div>
      </Modal>
    </div>
  );
}

/** Zdjęcia (zapisane + oczekujące) z przyciskami „Zrób zdjęcie” i „Z galerii”. */
export function PhotoStrip({
  existing, pending, onAdd, onRemoveExisting, onRemovePending, label, readOnly,
}: {
  existing: OrderPhotoView[];
  pending: DraftPhoto[];
  onAdd?: (p: UploadPayload) => Promise<void> | void;
  onRemoveExisting?: (p: OrderPhotoView) => void;
  onRemovePending?: (key: string) => void;
  label: string;
  readOnly?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className="mt-2" data-testid="photo-strip">
      {(existing.length > 0 || pending.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {existing.map((p) => (
            <div key={p.id} className="relative">
              <button type="button" onClick={() => setPreview(p.url)} aria-label={`Podgląd zdjęcia ${p.fileName}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbnailUrl ?? p.url} alt={p.fileName} className="h-16 w-16 rounded-lg border border-zinc-700 object-cover" />
              </button>
              {!readOnly && onRemoveExisting && <button type="button" onClick={() => onRemoveExisting(p)} className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-900 p-1 text-zinc-300 ring-1 ring-zinc-700" aria-label="Usuń zdjęcie"><X className="h-3 w-3" /></button>}
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.key} className="relative" data-testid="pending-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={p.fileName} className="h-16 w-16 rounded-lg border border-dashed border-orange-600 object-cover" />
              {onRemovePending && <button type="button" onClick={() => onRemovePending(p.key)} className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-900 p-1 text-zinc-300 ring-1 ring-zinc-700" aria-label="Usuń zdjęcie"><X className="h-3 w-3" /></button>}
            </div>
          ))}
        </div>
      )}
      {!readOnly && onAdd && (
        <div className="flex flex-wrap gap-2">
          <PhotoButton label="Zrób zdjęcie" onFile={onAdd} />
          <PhotoButton label="Z galerii" onFile={onAdd} capture={false} />
        </div>
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Zdjęcie ${label}`} maxWidth="max-w-2xl" closeOnOverlayClick={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Podgląd" className="max-h-[70vh] w-full rounded-lg object-contain" />}
      </Modal>
    </div>
  );
}
