'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { fieldClass, labelClass } from '@/components/ui/modal';
import { errorMessage, type UploadPayload } from '@/lib/protocols';
import { newKey, type DraftPhoto } from '@/lib/orders';
import {
  newClientToken, newRowKey, roomsToRows, validateRooms,
  type SimpleDefaults, type SimpleProtocolDetail, type SimpleRoomRow,
} from '@/lib/simple-protocols';
import { PhotoStrip } from '@/components/orders/OrderBuilder';
import { openPdf } from './ProtocolModals';

interface SiteLite { id: string; name: string; address?: string }
const MAX_BYTES = 10 * 1024 * 1024;

function checkPhoto(p: UploadPayload): string | null {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(p.base64)) return 'Dozwolone są tylko zdjęcia JPG, PNG lub WebP.';
  if (p.base64.length * 0.75 > MAX_BYTES) return 'Zdjęcie jest za duże (maks. 10 MB).';
  return null;
}

const Chip = ({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active} className={`min-h-[44px] rounded-lg border px-3 text-sm ${active ? 'border-orange-600 bg-orange-600/15 text-white' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>{children}</button>
);

/**
 * Protokół prosty: budowa (z listy albo wpisana ręcznie) → pomieszczenia z ilościami elementów → notatki → zdjęcia.
 * Zdjęcia dodane przed zapisem czekają w pamięci i są wysyłane zaraz po zapisie protokołu.
 */
export function SimpleProtocolForm({ initial, presetSiteId, defaults }: { initial?: SimpleProtocolDetail; presetSiteId?: string; defaults?: SimpleDefaults }) {
  const router = useRouter();
  const token = useRef(newClientToken());
  const busyRef = useRef(false);
  const readOnly = !!initial && !initial.permissions.canEdit;
  const lists = initial?.defaults ?? defaults ?? { items: [], rooms: [] };

  const [protocolId, setProtocolId] = useState(initial?.id ?? '');
  const [number, setNumber] = useState(initial?.number ?? '');
  const [siteMode, setSiteMode] = useState<'SITE' | 'EXTERNAL'>(initial?.site.source ?? 'SITE');
  const [siteId, setSiteId] = useState(initial?.site.siteId ?? presetSiteId ?? '');
  const [manualSite, setManualSite] = useState(initial?.site.source === 'EXTERNAL' ? [initial.site.name, initial.site.address].filter(Boolean).join(', ') : '');
  const [rooms, setRooms] = useState<SimpleRoomRow[]>(() => roomsToRows(initial?.rooms));
  const [notes, setNotes] = useState(initial?.description ?? '');
  const [photos, setPhotos] = useState(initial?.photos ?? []);
  const [pending, setPending] = useState<DraftPhoto[]>([]);
  const [sites, setSites] = useState<SiteLite[] | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'print'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');
  // Rozwinięta lista wyboru: 'room' (pomieszczenia) albo 'item:<klucz pomieszczenia>' (elementy). Przyciski zamiast natywnego <select> — na telefonie działają pewniej.
  const [picker, setPicker] = useState<string | null>(null);

  useEffect(() => {
    apiClient<SiteLite[]>('/api/sites').then(setSites).catch(() => setSites([]));
  }, []);

  const updateRoom = (key: string, fn: (r: SimpleRoomRow) => SimpleRoomRow) => setRooms((l) => l.map((r) => (r.key === key ? fn(r) : r)));
  const addRoom = (name: string) => setRooms((l) => [...l, { key: newRowKey(), name, items: [] }]);
  const addItem = (roomKey: string, name: string, custom: boolean) =>
    updateRoom(roomKey, (r) => {
      // wybranie z listy elementu, który już jest w pomieszczeniu, zwiększa jego ilość
      const existing = !custom && r.items.find((i) => !i.custom && i.name === name);
      if (existing) return { ...r, items: r.items.map((i) => (i === existing ? { ...i, qty: String((Number((i.qty || '0').replace(',', '.')) || 0) + 1).replace('.', ',') } : i)) };
      return { ...r, items: [...r.items, { key: newRowKey(), name, qty: custom ? '' : '1', custom }] };
    });

  const addPhoto = async (p: UploadPayload) => {
    const bad = checkPhoto(p);
    if (bad) { setError(bad); return; }
    setError('');
    setPending((l) => [...l, { key: newKey(), fileName: p.fileName, base64: p.base64, preview: p.base64 }]);
  };
  const removeExisting = async (ph: { id: string }) => {
    if (!protocolId) return;
    try {
      await apiClient(`/api/simple-protocols/${protocolId}/photos/${ph.id}`, { method: 'DELETE' });
      setPhotos((l) => l.filter((x) => x.id !== ph.id));
    } catch (e) { setError(errorMessage(e)); }
  };

  const validate = (): string | null => {
    if (siteMode === 'SITE' && !siteId) return 'Wybierz budowę z listy albo przełącz na wpisanie ręczne.';
    if (siteMode === 'EXTERNAL' && !manualSite.trim()) return 'Wpisz nazwę lub adres budynku.';
    return validateRooms(rooms);
  };

  /** Zapisuje protokół i wysyła oczekujące zdjęcia. Zwraca id albo null przy błędzie. */
  const persist = async (): Promise<string | null> => {
    const bad = validate();
    if (bad) { setError(bad); return null; }
    const body = {
      description: notes,
      rooms: rooms.map((r) => ({ name: r.name.trim(), items: r.items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), quantity: i.qty.trim(), custom: i.custom })) })),
      ...(siteMode === 'SITE' ? { siteId } : { externalSite: { name: manualSite.trim() } }),
    };
    const saved = protocolId
      ? await apiClient<SimpleProtocolDetail>(`/api/simple-protocols/${protocolId}`, { method: 'PUT', body })
      : await apiClient<SimpleProtocolDetail>('/api/simple-protocols', { method: 'POST', body: { ...body, clientToken: token.current } });
    setProtocolId(saved.id);
    setNumber(saved.number);

    let failed = 0;
    const done = new Set<string>();
    for (const ph of pending) {
      try {
        await apiClient(`/api/simple-protocols/${saved.id}/photos`, { method: 'POST', body: { fileName: ph.fileName, base64: ph.base64 } });
        done.add(ph.key);
      } catch { failed++; }
    }
    setPending((l) => l.filter((p) => !done.has(p.key)));
    const fresh = await apiClient<SimpleProtocolDetail>(`/api/simple-protocols/${saved.id}`);
    setPhotos(fresh.photos);
    setRooms(roomsToRows(fresh.rooms)); // pokazujemy dokładnie to, co zostało zapisane (puste pozycje znikają)
    setWarning(failed ? `Protokół zapisany, ale nie wysłano zdjęć: ${failed}. Dodaj je ponownie i kliknij „Zapisz”.` : '');
    return saved.id;
  };

  const run = async (kind: 'save' | 'print') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(''); setNotice('');
    // Okno otwieramy od razu po kliknięciu — inaczej przeglądarka telefonu blokuje wyskakujące okno
    const win = kind === 'print' && typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const id = readOnly ? protocolId : await persist();
      if (!id) { win?.close(); return; }
      if (kind === 'print') {
        const res = await apiClient<{ pdfUrl: string; fileName: string }>(`/api/simple-protocols/${id}/print`, { method: 'POST' });
        openPdf(res.pdfUrl, win);
      } else {
        setNotice('Zapisano.');
        if (!initial && typeof window !== 'undefined' && window.location.pathname.endsWith('/simple/new')) router.replace(`/protocols/simple/${id}`);
      }
    } catch (e) {
      win?.close();
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };

  const dis = readOnly;
  return (
    <div className="mx-auto max-w-3xl px-4 py-4" data-testid="simple-form">
      <Link href="/protocols" className="text-sm text-zinc-400 hover:text-zinc-200">← Protokoły</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">Protokół prosty{number && <span className="ml-2 text-base text-orange-400">{number}</span>}</h1>
        {initial && <span className="text-xs text-zinc-500">Wykonał: {initial.createdBy.name}</span>}
      </div>
      {readOnly && <p className="mb-3 rounded-lg bg-zinc-900 p-2 text-xs text-zinc-400">Podgląd — możesz edytować wyłącznie własne protokoły. Wydruk jest dostępny.</p>}

      <section className="rounded-xl border border-zinc-800 p-4">
        <label className={labelClass}>Budowa</label>
        <div className="grid grid-cols-2 gap-2">
          <Chip active={siteMode === 'SITE'} disabled={dis} onClick={() => setSiteMode('SITE')}>Wybierz z listy</Chip>
          <Chip active={siteMode === 'EXTERNAL'} disabled={dis} onClick={() => setSiteMode('EXTERNAL')}>Wpisz ręcznie</Chip>
        </div>
        {siteMode === 'SITE' ? (
          <select className={`${fieldClass} mt-2 min-h-[44px]`} value={siteId} disabled={dis} onChange={(e) => setSiteId(e.target.value)} aria-label="Budowa">
            <option value="">{sites === null ? 'Ładowanie…' : 'Wybierz budowę…'}</option>
            {initial?.site.siteId && !sites?.some((s) => s.id === initial.site.siteId) && <option value={initial.site.siteId}>{initial.site.name}</option>}
            {(sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>)}
          </select>
        ) : (
          <input className={`${fieldClass} mt-2 min-h-[44px]`} disabled={dis} value={manualSite} onChange={(e) => setManualSite(e.target.value)} placeholder="Nazwa i adres budynku" aria-label="Budynek (wpisz ręcznie)" />
        )}
      </section>

      <section className="mt-4 space-y-3" data-testid="rooms">
        {rooms.map((room) => (
          <div key={room.key} className="rounded-xl border border-zinc-800 p-3" data-testid="room">
            <div className="flex items-center gap-2">
              <input className={`${fieldClass} min-h-[44px] flex-1 font-medium`} disabled={dis} value={room.name} onChange={(e) => updateRoom(room.key, (r) => ({ ...r, name: e.target.value }))} placeholder="Pomieszczenie (np. Łazienka)" aria-label="Nazwa pomieszczenia" />
              {!dis && <button type="button" onClick={() => setRooms((l) => l.filter((r) => r.key !== room.key))} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400" aria-label="Usuń pomieszczenie"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="mt-2 space-y-2">
              {room.items.map((it) => (
                <div key={it.key} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2" data-testid="item-row">
                  {it.custom ? (
                    <input className={`${fieldClass} min-h-[44px]`} disabled={dis} value={it.name} onChange={(e) => updateRoom(room.key, (r) => ({ ...r, items: r.items.map((x) => (x.key === it.key ? { ...x, name: e.target.value } : x)) }))} placeholder="Nazwa elementu" aria-label="Nazwa własnego elementu" />
                  ) : (
                    <p className="px-1 text-sm font-medium text-zinc-100">{it.name}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Ilość</span>
                    <input
                      inputMode="decimal" className={`${fieldClass} min-h-[44px] !w-24 shrink-0 text-right`} disabled={dis} placeholder="0"
                      value={it.qty} onChange={(e) => updateRoom(room.key, (r) => ({ ...r, items: r.items.map((x) => (x.key === it.key ? { ...x, qty: e.target.value } : x)) }))}
                      aria-label={`Ilość: ${it.name || 'własny element'} (${room.name || 'pomieszczenie'})`}
                    />
                    <span className="text-xs text-zinc-500">szt.</span>
                    {!dis && <button type="button" onClick={() => updateRoom(room.key, (r) => ({ ...r, items: r.items.filter((x) => x.key !== it.key) }))} className="ml-auto rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400" aria-label="Usuń element"><X className="h-5 w-5" /></button>}
                  </div>
                </div>
              ))}
            </div>
            {!dis && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" className="h-11" onClick={() => setPicker(picker === `item:${room.key}` ? null : `item:${room.key}`)} aria-expanded={picker === `item:${room.key}`} data-testid="open-item-picker">
                  <Plus className="mr-1 h-4 w-4" />Element z listy
                </Button>
                <Button type="button" variant="outline" className="h-11" onClick={() => { addItem(room.key, '', true); setPicker(null); }} data-testid="add-custom-item">
                  <Plus className="mr-1 h-4 w-4" />Własny element
                </Button>
              </div>
            )}
            {!dis && picker === `item:${room.key}` && (
              <div className="mt-2 flex flex-wrap gap-2 rounded-lg bg-zinc-900 p-2" data-testid="item-picker">
                {lists.items.map((n) => (
                  <button key={n} type="button" onClick={() => { addItem(room.key, n, false); setPicker(null); }} className="min-h-[44px] rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-orange-600 hover:bg-zinc-800">{n}</button>
                ))}
                <button type="button" onClick={() => setPicker(null)} className="min-h-[44px] rounded-lg px-3 text-sm text-zinc-500 hover:text-zinc-300">Zamknij</button>
              </div>
            )}
          </div>
        ))}
        {!dis && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => setPicker(picker === 'room' ? null : 'room')} aria-expanded={picker === 'room'} data-testid="open-room-picker">
              <Plus className="mr-1 h-4 w-4" />Pomieszczenie z listy
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => { addRoom(''); setPicker(null); }} data-testid="add-custom-room">
              <Plus className="mr-1 h-4 w-4" />Własne pomieszczenie
            </Button>
          </div>
        )}
        {!dis && picker === 'room' && (
          <div className="flex flex-wrap gap-2 rounded-lg bg-zinc-900 p-2" data-testid="room-picker">
            {lists.rooms.map((n) => (
              <button key={n} type="button" onClick={() => { addRoom(n); setPicker(null); }} className="min-h-[44px] rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-orange-600 hover:bg-zinc-800">{n}</button>
            ))}
            <button type="button" onClick={() => setPicker(null)} className="min-h-[44px] rounded-lg px-3 text-sm text-zinc-500 hover:text-zinc-300">Zamknij</button>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-zinc-800 p-4">
        <label className={labelClass} htmlFor="sp-notes">Notatki</label>
        <textarea id="sp-notes" rows={5} className={`${fieldClass} min-h-[110px]`} value={notes} disabled={dis} onChange={(e) => setNotes(e.target.value)} placeholder="Dodatkowe uwagi…" />
      </section>

      <section className="mt-4 rounded-xl border border-zinc-800 p-4">
        <h2 className="mb-1 text-sm font-semibold text-white">Zdjęcia</h2>
        <PhotoStrip
          existing={photos.map((p) => ({ ...p, itemId: null }))} pending={pending} label="protokołu" readOnly={dis}
          onAdd={addPhoto} onRemoveExisting={removeExisting} onRemovePending={(k) => setPending((l) => l.filter((p) => p.key !== k))}
        />
      </section>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-950/50 p-2 text-sm text-red-300">{error}</p>}
      {warning && <p className="mt-4 rounded-lg bg-yellow-950/40 p-2 text-sm text-yellow-300">{warning}</p>}
      {notice && <p data-testid="notice" className="mt-4 rounded-lg bg-green-950/40 p-2 text-sm text-green-300">{notice}</p>}

      <div className="sticky bottom-0 mt-4 flex flex-wrap gap-2 border-t border-zinc-800 bg-graphite-950/95 py-3">
        {!dis && (
          <Button className="h-11 flex-1" onClick={() => run('save')} disabled={!!busy} data-testid="save-btn">
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" />Zapisz</>}
          </Button>
        )}
        <Button variant="outline" className="h-11 flex-1" onClick={() => run('print')} disabled={!!busy} data-testid="print-btn">
          {busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Printer className="mr-2 h-4 w-4" />Drukuj / PDF</>}
        </Button>
      </div>
    </div>
  );
}
