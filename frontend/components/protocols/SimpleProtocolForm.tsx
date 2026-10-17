'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { fieldClass, labelClass } from '@/components/ui/modal';
import { errorMessage, formatDate, todayYmd, type UploadPayload } from '@/lib/protocols';
import { newKey, type DraftPhoto } from '@/lib/orders';
import {
  SIMPLE_EXTERNAL_FIELDS, buildRows, newClientToken, newRowKey, validateRows,
  type SimpleProtocolDetail, type SimpleRow,
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
 * Formularz protokołu prostego — nowy (bez `initial`) albo otwarty zapisany protokół.
 * Zdjęcia dodane przed zapisem czekają w pamięci i są wysyłane zaraz po zapisie protokołu.
 */
export function SimpleProtocolForm({ initial, presetSiteId, defaults }: { initial?: SimpleProtocolDetail; presetSiteId?: string; defaults?: string[] }) {
  const router = useRouter();
  const token = useRef(newClientToken());
  const busyRef = useRef(false);
  const readOnly = !!initial && !initial.permissions.canEdit;

  const [protocolId, setProtocolId] = useState(initial?.id ?? '');
  const [number, setNumber] = useState(initial?.number ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [siteMode, setSiteMode] = useState<'SITE' | 'EXTERNAL'>(initial?.site.source ?? 'SITE');
  const [siteId, setSiteId] = useState(initial?.site.siteId ?? presetSiteId ?? '');
  const [external, setExternal] = useState<Record<string, string>>(
    initial?.site.source === 'EXTERNAL' ? { name: initial.site.name, address: initial.site.address, investor: initial.site.investor ?? '', contactPerson: initial.site.contactPerson ?? '', phone: initial.site.phone ?? '' } : {},
  );
  const [performedAt, setPerformedAt] = useState(initial?.performedAt ?? todayYmd());
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rows, setRows] = useState<SimpleRow[]>(() => buildRows(initial?.defaults ?? defaults ?? [], initial?.items ?? []));
  const [photos, setPhotos] = useState(initial?.photos ?? []);
  const [pending, setPending] = useState<DraftPhoto[]>([]);
  const [sites, setSites] = useState<SiteLite[] | null>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'print'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    apiClient<SiteLite[]>('/api/sites').then(setSites).catch(() => setSites([]));
  }, []);
  useEffect(() => {
    if (initial || (defaults && defaults.length)) return;
    apiClient<{ items: string[] }>('/api/simple-protocols/defaults').then((d) => setRows((cur) => (cur.length ? cur : buildRows(d.items)))).catch(() => undefined);
  }, [initial, defaults]);

  const setQty = (key: string, qty: string) => setRows((l) => l.map((r) => (r.key === key ? { ...r, qty } : r)));
  const setRowName = (key: string, n: string) => setRows((l) => l.map((r) => (r.key === key ? { ...r, name: n } : r)));

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
    if (siteMode === 'SITE' && !siteId) return 'Wybierz budynek z listy albo przełącz na budynek zewnętrzny.';
    if (siteMode === 'EXTERNAL' && !external.name?.trim()) return 'Podaj nazwę budynku zewnętrznego.';
    if (!performedAt) return 'Podaj datę wykonania.';
    return validateRows(rows);
  };

  /** Zapisuje protokół i wysyła oczekujące zdjęcia. Zwraca id albo null przy błędzie. */
  const persist = async (): Promise<string | null> => {
    const bad = validate();
    if (bad) { setError(bad); return null; }
    const clean = Object.fromEntries(Object.entries(external).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()]));
    const body = {
      name: name.trim(),
      performedAt,
      description,
      items: rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), quantity: r.qty.trim(), custom: r.custom })),
      ...(siteMode === 'SITE' ? { siteId } : { externalSite: clean }),
    };
    const saved = protocolId
      ? await apiClient<SimpleProtocolDetail>(`/api/simple-protocols/${protocolId}`, { method: 'PUT', body })
      : await apiClient<SimpleProtocolDetail>('/api/simple-protocols', { method: 'POST', body: { ...body, clientToken: token.current } });
    setProtocolId(saved.id);
    setNumber(saved.number);
    setName(saved.name);

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

      <section className="space-y-4 rounded-xl border border-zinc-800 p-4">
        <div>
          <label className={labelClass} htmlFor="sp-name">Nazwa protokołu</label>
          <input id="sp-name" className={fieldClass} value={name} disabled={dis} onChange={(e) => setName(e.target.value)} placeholder="np. Instalacja elektryczna — piętro 1" />
        </div>

        <div>
          <label className={labelClass}>Budynek</label>
          <div className="grid grid-cols-2 gap-2">
            <Chip active={siteMode === 'SITE'} disabled={dis} onClick={() => setSiteMode('SITE')}>Budowa z P-Troy</Chip>
            <Chip active={siteMode === 'EXTERNAL'} disabled={dis} onClick={() => setSiteMode('EXTERNAL')}>Budynek zewnętrzny</Chip>
          </div>
          {siteMode === 'SITE' ? (
            <select className={`${fieldClass} mt-2 min-h-[44px]`} value={siteId} disabled={dis} onChange={(e) => setSiteId(e.target.value)} aria-label="Budowa">
              <option value="">{sites === null ? 'Ładowanie…' : 'Wybierz budowę…'}</option>
              {initial?.site.siteId && !sites?.some((s) => s.id === initial.site.siteId) && <option value={initial.site.siteId}>{initial.site.name}</option>}
              {(sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>)}
            </select>
          ) : (
            <div className="mt-2 space-y-2">
              {SIMPLE_EXTERNAL_FIELDS.map((f) => (
                <input key={f.key} className={fieldClass} disabled={dis} placeholder={f.label + (f.required ? ' *' : '')} aria-label={f.label} value={external[f.key] ?? ''} onChange={(e) => setExternal({ ...external, [f.key]: e.target.value })} />
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="sp-date">Data wykonania</label>
          <input id="sp-date" type="date" className={`${fieldClass} min-h-[44px]`} value={performedAt} disabled={dis} onChange={(e) => setPerformedAt(e.target.value)} />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-zinc-800 p-4">
        <label className={labelClass} htmlFor="sp-desc">Opis wykonanych prac</label>
        <textarea id="sp-desc" rows={8} className={`${fieldClass} min-h-[160px]`} value={description} disabled={dis} onChange={(e) => setDescription(e.target.value)} placeholder="Opisz, jakie prace zostały wykonane…" />
      </section>

      <section className="mt-4 rounded-xl border border-zinc-800 p-4">
        <h2 className="mb-1 text-sm font-semibold text-white">Zamontowane elementy</h2>
        <p className="mb-3 text-xs text-zinc-500">Wpisz liczbę sztuk. Puste pola są pomijane — w wydruku pojawią się tylko elementy z ilością większą od zera.</p>
        <div className="space-y-2" data-testid="item-rows">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2" data-testid="item-row">
              {r.custom ? (
                <input className={`${fieldClass} min-w-0 flex-1`} disabled={dis} value={r.name} onChange={(e) => setRowName(r.key, e.target.value)} placeholder="Nazwa elementu" aria-label="Nazwa własnego elementu" />
              ) : (
                <span className="min-w-0 flex-1 text-sm text-zinc-200">{r.name}</span>
              )}
              <input
                inputMode="decimal" className={`${fieldClass} w-24 min-h-[44px] text-right`} disabled={dis}
                value={r.qty} onChange={(e) => setQty(r.key, e.target.value)} placeholder="0" aria-label={`Ilość: ${r.name || 'własny element'}`}
              />
              {r.custom && !dis && <button type="button" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400" aria-label="Usuń element"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
        {!dis && (
          <Button type="button" variant="outline" className="mt-3 h-11" data-testid="add-item" onClick={() => setRows((l) => [...l, { key: newRowKey(), name: '', qty: '', custom: true }])}>
            <Plus className="mr-2 h-4 w-4" />Dodaj element
          </Button>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-zinc-800 p-4">
        <h2 className="mb-1 text-sm font-semibold text-white">Zdjęcia</h2>
        <PhotoStrip
          existing={photos.map((p) => ({ ...p, itemId: null }))} pending={pending} label="protokołu" readOnly={dis}
          onAdd={addPhoto} onRemoveExisting={removeExisting} onRemovePending={(k) => setPending((l) => l.filter((p) => p.key !== k))}
        />
        {!dis && <p className="mt-2 text-xs text-zinc-500">Zdjęcia zostaną zapisane razem z protokołem.</p>}
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
      {initial && <p className="mt-1 text-center text-[11px] text-zinc-600">Data wykonania: {formatDate(initial.performedAt)}</p>}
    </div>
  );
}
