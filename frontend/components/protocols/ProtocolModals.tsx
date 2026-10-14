'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, Download, Trash2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';
import {
  type CalcConfig,
  type CustomFieldDef,
  type ProtocolDetail,
  type ProtocolSchema,
  type SectionDef,
  errorMessage,
  isSectionVisible,
} from '@/lib/protocols';

// ---------------------------------------------------------------------------
// Drukuj pomiary / Pusty formularz / pełny PDF
// ---------------------------------------------------------------------------

export const PRINT_NOTICE = 'Wydruk będzie zawierał dane zapisane w protokole na moment generowania dokumentu.';

/** Otwiera PDF w nowej karcie (na telefonie przeglądarka sama zaproponuje drukowanie / udostępnianie). */
export function openPdf(url: string, win?: Window | null) {
  if (win && !win.closed) {
    win.location.href = url;
  } else if (typeof window !== 'undefined') {
    const w = window.open(url, '_blank');
    if (!w) window.location.href = url;
  }
}

function hasContent(def: SectionDef, data: Record<string, any>): boolean {
  const b = def.isCustom ? data.custom?.[def.key] : data[def.key];
  if (def.kind === 'table' || def.isCustom) {
    const rows = def.isCustom ? b?.rows : b;
    return Array.isArray(rows) && rows.length > 0;
  }
  if (def.kind === 'lightning') return !!b?.present;
  if (def.kind === 'checklist') return (b?.items ?? []).some((i: any) => i.state || (i.note && String(i.note).trim()));
  return false;
}

export function PrintMeasurementsModal({
  open,
  onClose,
  protocol,
  schema,
  beforePrint,
}: {
  open: boolean;
  onClose: () => void;
  protocol: ProtocolDetail;
  schema: ProtocolSchema;
  /** Zapisuje niezapisane zmiany, żeby wydruk zawierał aktualne dane. */
  beforePrint?: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'MEASUREMENTS' | 'BLANK'>('MEASUREMENTS');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowsPreset, setRowsPreset] = useState<string>('20');
  const [rowsCustom, setRowsCustom] = useState('');
  const [busy, setBusy] = useState<'PRINT' | 'DOWNLOAD' | null>(null);
  const [error, setError] = useState('');

  const data = protocol.data ?? {};
  const sections = useMemo(
    () =>
      schema.sections.filter(
        (s) => s.measurement && ['table', 'checklist', 'lightning'].includes(s.kind) && isSectionVisible(s, protocol.objectType, data),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, protocol.objectType, protocol.data],
  );
  const selectable = useMemo(() => (mode === 'MEASUREMENTS' ? sections.filter((s) => hasContent(s, data)) : sections), [mode, sections, data]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSelected(new Set(selectable.map((s) => s.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const toggle = (key: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const blankRows = rowsPreset === 'custom' ? parseInt(rowsCustom, 10) : parseInt(rowsPreset, 10);
  const rowsOk = mode !== 'BLANK' || (Number.isFinite(blankRows) && blankRows >= 1 && blankRows <= 500);
  const canRun = selected.size > 0 && rowsOk && !busy;

  const run = async (action: 'PRINT' | 'DOWNLOAD') => {
    setBusy(action);
    setError('');
    const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      if (beforePrint) await beforePrint();
      const res = await apiClient<{ pdfUrl: string; fileName: string }>(`/api/protocols/${protocol.id}/print`, {
        method: 'POST',
        body: { mode, sections: Array.from(selected), ...(mode === 'BLANK' ? { blankRows } : {}), action },
      });
      openPdf(res.pdfUrl, win);
      onClose();
    } catch (e) {
      win?.close();
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Drukuj pomiary" description={`Protokół ${protocol.number}`} maxWidth="max-w-lg" closeOnOverlayClick={false}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rodzaj wydruku">
          {([
            ['MEASUREMENTS', 'Wypełnione pomiary'],
            ['BLANK', 'Pusty formularz'],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mode === v}
              onClick={() => setMode(v)}
              className={`min-h-[44px] rounded-lg border px-3 text-sm ${mode === v ? 'border-orange-500 bg-orange-950/40 text-orange-100' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Sekcje do wydruku</span>
            <span className="flex gap-3 text-xs">
              <button type="button" className="text-orange-400 hover:underline" onClick={() => setSelected(new Set(selectable.map((s) => s.key)))}>Zaznacz wszystko</button>
              <button type="button" className="text-zinc-400 hover:underline" onClick={() => setSelected(new Set())}>Odznacz wszystko</button>
            </span>
          </div>
          {selectable.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-500">
              {mode === 'MEASUREMENTS' ? 'W protokole nie ma jeszcze wypełnionych pomiarów.' : 'Brak sekcji pomiarowych dla tego typu obiektu.'}
            </p>
          ) : (
            <ul className="max-h-56 divide-y divide-zinc-800 overflow-y-auto rounded-lg border border-zinc-800">
              {selectable.map((s) => (
                <li key={s.key}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 text-sm text-zinc-200">
                    <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={selected.has(s.key)} onChange={() => toggle(s.key)} />
                    {s.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {mode === 'BLANK' && (
          <div>
            <span className="text-xs text-zinc-400">Liczba pustych wierszy w każdej tabeli</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {['10', '20', '30', '50', '100', 'custom'].map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={rowsPreset === p}
                  onClick={() => setRowsPreset(p)}
                  className={`min-h-[44px] min-w-[52px] rounded-lg border px-3 text-sm ${rowsPreset === p ? 'border-orange-500 bg-orange-950/40 text-orange-100' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
                >
                  {p === 'custom' ? 'Inna' : p}
                </button>
              ))}
              {rowsPreset === 'custom' && (
                <input type="number" min={1} max={500} className={`${fieldClass} max-w-[110px]`} value={rowsCustom} onChange={(e) => setRowsCustom(e.target.value)} placeholder="1–500" aria-label="Własna liczba wierszy" />
              )}
            </div>
          </div>
        )}

        {mode === 'MEASUREMENTS' && <p className="rounded-lg bg-zinc-800/60 p-3 text-xs text-zinc-300">{PRINT_NOTICE}</p>}
        {error && <p className="rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button variant="outline" disabled={!canRun} onClick={() => run('DOWNLOAD')}>
            {busy === 'DOWNLOAD' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Pobierz PDF
          </Button>
          <Button disabled={!canRun} onClick={() => run('PRINT')}>
            {busy === 'PRINT' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}Drukuj
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Import z rozdzielni
// ---------------------------------------------------------------------------

export function ImportBoardModal({
  open,
  onClose,
  protocolId,
  defaultSection,
  schema,
  beforeImport,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  protocolId: string;
  defaultSection?: string;
  schema: ProtocolSchema;
  beforeImport?: () => Promise<void>;
  onImported: (p: ProtocolDetail, added: any) => void;
}) {
  const [boards, setBoards] = useState<{ id: string; name: string; description?: string; deviceCount: number }[] | null>(null);
  const [boardId, setBoardId] = useState('');
  const [sections, setSections] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = schema.sections.filter((s) => ['loop', 'rcd', 'continuity', 'insulation'].includes(s.key));

  useEffect(() => {
    if (!open) return;
    setError('');
    setBoardId('');
    setSections(new Set(defaultSection ? [defaultSection] : ['loop', 'rcd']));
    setBoards(null);
    apiClient<any[]>(`/api/protocols/${protocolId}/boards`).then(setBoards).catch((e) => { setBoards([]); setError(errorMessage(e)); });
  }, [open, protocolId, defaultSection]);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      if (beforeImport) await beforeImport();
      const res = await apiClient<{ protocol: ProtocolDetail; imported: any }>(`/api/protocols/${protocolId}/import-board`, {
        method: 'POST',
        body: { boardId, sections: Array.from(sections) },
      });
      onImported(res.protocol, res.imported);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Importuj z rozdzielni" description="Dopisze obwody i zabezpieczenia z modułu Rozdzielnie. Ponowny import nie dubluje pozycji." closeOnOverlayClick={false}>
      {boards === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
      ) : boards.length === 0 ? (
        <p className="text-sm text-zinc-400">Ta budowa nie ma rozdzielni (albo protokół dotyczy obiektu spoza P-Troy).</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Rozdzielnia</label>
            <select className={fieldClass} value={boardId} onChange={(e) => setBoardId(e.target.value)} aria-label="Rozdzielnia">
              <option value="">Wybierz…</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.deviceCount})</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Do których tabel dopisać</label>
            {options.map((s) => (
              <label key={s.key} className="flex min-h-[40px] items-center gap-3 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-600"
                  checked={sections.has(s.key)}
                  onChange={() => setSections((c) => { const n = new Set(c); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                />
                {s.title}
              </label>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Anuluj</Button>
        <Button disabled={!boardId || sections.size === 0 || busy} onClick={run}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Importuj
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Wybór przyrządów ze Sprzętu
// ---------------------------------------------------------------------------

export interface InstrumentOption { id: string; name: string; manufacturer: string; model: string; serialNumber: string; kind: string }

export function InstrumentPickerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (items: InstrumentOption[]) => void }) {
  const [items, setItems] = useState<InstrumentOption[] | null>(null);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setItems(null);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (all) qs.set('all', '1');
    apiClient<InstrumentOption[]>(`/api/protocols/instruments?${qs}`).then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [q, all]);

  useEffect(() => {
    if (open) { setSel(new Set()); setError(''); load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, all]);

  return (
    <Modal open={open} onClose={onClose} title="Wybierz przyrządy ze Sprzętu" description="Domyślnie pokazujemy kategorię „Mierniki”." maxWidth="max-w-lg" closeOnOverlayClick={false}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className={fieldClass} placeholder="Szukaj (nazwa, producent, nr fabryczny)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj przyrządu" />
        <Button type="submit" variant="outline">Szukaj</Button>
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
        <input type="checkbox" className="accent-orange-600" checked={all} onChange={(e) => setAll(e.target.checked)} /> Pokaż cały sprzęt, nie tylko mierniki
      </label>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-zinc-800">
        {items === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Brak wyników.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {items.map((it) => (
              <li key={it.id}>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-3 py-2 text-sm text-zinc-200">
                  <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={sel.has(it.id)} onChange={() => setSel((c) => { const n = new Set(c); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n; })} />
                  <span>
                    {it.name}
                    <span className="block text-xs text-zinc-500">{[it.manufacturer, it.model, it.serialNumber && `nr ${it.serialNumber}`].filter(Boolean).join(' · ')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <p className="mt-2 text-xs text-zinc-500">Daty wzorcowania i numer świadectwa uzupełnij w tabeli — nie ma ich w module Sprzęt.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Anuluj</Button>
        <Button disabled={sel.size === 0} onClick={() => { onPick((items ?? []).filter((i) => sel.has(i.id))); onClose(); }}>Dodaj do protokołu</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Konfiguracja obliczeń (administrator)
// ---------------------------------------------------------------------------

const CHARS = ['B', 'C', 'D', 'K', 'Z'] as const;

export function CalcConfigModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (c: CalcConfig) => void }) {
  const [u0, setU0] = useState('');
  const [coef, setCoef] = useState<Record<string, string>>({});
  const [basis, setBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    apiClient<CalcConfig>('/api/protocols/config').then((c) => {
      setU0(c.u0 == null ? '' : String(c.u0));
      setBasis(c.basis ?? '');
      setCoef(Object.fromEntries(CHARS.map((k) => [k, c.coefficients?.[k] == null ? '' : String(c.coefficients[k])])));
    }).catch((e) => setError(errorMessage(e)));
  }, [open]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
      const body = { u0: num(u0), coefficients: Object.fromEntries(CHARS.map((k) => [k, num(coef[k] ?? '')])), basis: basis.trim() || null };
      const res = await apiClient<CalcConfig>('/api/protocols/config', { method: 'PUT', body });
      onSaved?.(res);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Obliczenia pętli zwarcia" description="Aplikacja nie ma wbudowanych norm — liczy tylko z wartości, które tu wpiszesz." closeOnOverlayClick={false}>
      <label className={labelClass}>Napięcie U0 [V]</label>
      <input className={fieldClass} inputMode="decimal" value={u0} onChange={(e) => setU0(e.target.value)} aria-label="U0" />
      <label className={labelClass}>Współczynnik k (Ia = k × In) dla charakterystyki</label>
      <div className="grid grid-cols-5 gap-2">
        {CHARS.map((k) => (
          <div key={k}>
            <span className="mb-1 block text-center text-xs text-zinc-500">{k}</span>
            <input className={fieldClass} inputMode="decimal" value={coef[k] ?? ''} onChange={(e) => setCoef((c) => ({ ...c, [k]: e.target.value }))} aria-label={`Współczynnik ${k}`} />
          </div>
        ))}
      </div>
      <label className={labelClass}>Podstawa przyjętych wartości (np. norma, rok) — pojawi się w protokole</label>
      <input className={fieldClass} value={basis} onChange={(e) => setBasis(e.target.value)} aria-label="Podstawa" />
      {error && <p className="mt-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Anuluj</Button>
        <Button disabled={busy} onClick={save}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Zapisz</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Własne pola i sekcje (administrator)
// ---------------------------------------------------------------------------

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Tekst', number: 'Liczba', date: 'Data', checkbox: 'Tak/Nie', list: 'Lista wyboru', table: 'Tabela', photo: 'Zdjęcie', attachment: 'Załącznik',
};

const parseList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function DefinitionsModal({ open, onClose, schema, onChanged }: { open: boolean; onClose: () => void; schema: ProtocolSchema; onChanged: () => void }) {
  const [defs, setDefs] = useState<{ customSections: SectionDef[]; customFields: CustomFieldDef[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fld, setFld] = useState({ sectionKey: '', label: '', type: 'text', unit: '', required: false, options: '' });
  const [sec, setSec] = useState({ title: '', columns: '' });

  const load = useCallback(() => apiClient<any>('/api/protocols/definitions').then(setDefs).catch((e) => setError(errorMessage(e))), []);
  useEffect(() => { if (open) { setError(''); load(); } }, [open, load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); onChanged(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const addField = () => run(async () => {
    const options = fld.type === 'list' ? parseList(fld.options) : fld.type === 'table' ? parseList(fld.options).map((label) => ({ label, type: 'text' })) : undefined;
    await apiClient('/api/protocols/definitions/fields', {
      method: 'POST',
      body: { sectionKey: fld.sectionKey, label: fld.label.trim(), type: fld.type, unit: fld.unit.trim() || undefined, required: fld.required, ...(options ? { options } : {}) },
    });
    setFld({ sectionKey: fld.sectionKey, label: '', type: 'text', unit: '', required: false, options: '' });
  });

  const addSection = () => run(async () => {
    const columns = parseList(sec.columns).map((label) => ({ label, type: 'text' }));
    await apiClient('/api/protocols/definitions/sections', { method: 'POST', body: { title: sec.title.trim(), ...(columns.length ? { columns } : {}) } });
    setSec({ title: '', columns: '' });
  });

  const sectionOptions = [...schema.sections.filter((s) => !s.isCustom), ...(defs?.customSections ?? [])];

  return (
    <Modal open={open} onClose={onClose} title="Własne pola i sekcje" description="Dodawane pola pojawiają się w nowych i niezatwierdzonych protokołach. Zatwierdzone protokoły się nie zmieniają." maxWidth="max-w-2xl" closeOnOverlayClick={false}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <section>
          <h4 className="mb-2 text-sm font-semibold text-zinc-200">Nowe pole</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select className={fieldClass} value={fld.sectionKey} onChange={(e) => setFld({ ...fld, sectionKey: e.target.value })} aria-label="Sekcja pola">
              <option value="">Sekcja…</option>
              {sectionOptions.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
            </select>
            <select className={fieldClass} value={fld.type} onChange={(e) => setFld({ ...fld, type: e.target.value })} aria-label="Typ pola">
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={fieldClass} placeholder="Nazwa pola" value={fld.label} onChange={(e) => setFld({ ...fld, label: e.target.value })} aria-label="Nazwa pola" />
            <input className={fieldClass} placeholder="Jednostka (opcjonalnie)" value={fld.unit} onChange={(e) => setFld({ ...fld, unit: e.target.value })} aria-label="Jednostka" />
            {(fld.type === 'list' || fld.type === 'table') && (
              <input className={`${fieldClass} sm:col-span-2`} placeholder={fld.type === 'list' ? 'Opcje oddzielone przecinkami' : 'Kolumny oddzielone przecinkami'} value={fld.options} onChange={(e) => setFld({ ...fld, options: e.target.value })} aria-label="Opcje" />
            )}
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" className="accent-orange-600" checked={fld.required} onChange={(e) => setFld({ ...fld, required: e.target.checked })} /> Pole obowiązkowe przy zatwierdzaniu
            </label>
          </div>
          <Button className="mt-2" disabled={busy || !fld.sectionKey || !fld.label.trim()} onClick={addField}><Plus className="mr-1 h-4 w-4" />Dodaj pole</Button>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-zinc-200">Nowa sekcja</h4>
          <input className={fieldClass} placeholder="Tytuł sekcji" value={sec.title} onChange={(e) => setSec({ ...sec, title: e.target.value })} aria-label="Tytuł sekcji" />
          <input className={`${fieldClass} mt-2`} placeholder="Kolumny tabeli oddzielone przecinkami (puste = sekcja z polami)" value={sec.columns} onChange={(e) => setSec({ ...sec, columns: e.target.value })} aria-label="Kolumny sekcji" />
          <Button className="mt-2" disabled={busy || !sec.title.trim()} onClick={addSection}><Plus className="mr-1 h-4 w-4" />Dodaj sekcję</Button>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-zinc-200">Dodane przez Ciebie</h4>
          {!defs ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : defs.customSections.length + defs.customFields.length === 0 ? (
            <p className="text-sm text-zinc-500">Nic jeszcze nie dodano.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 text-sm">
              {defs.customSections.map((s: any) => (
                <li key={s.key} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-zinc-200">Sekcja: {s.title}{s.isActive === false && <em className="ml-2 text-xs text-zinc-500">wyłączona</em>}</span>
                  {s.isActive !== false && <button type="button" aria-label="Wyłącz sekcję" disabled={busy} className="rounded p-2 text-red-400 hover:bg-zinc-800" onClick={() => { const row = (defs as any).sectionRows?.find((r: any) => r.key === s.key); if (row) run(() => apiClient(`/api/protocols/definitions/sections/${row.id}`, { method: 'DELETE' })); }}><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
              {defs.customFields.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-zinc-200">Pole: {f.label} <span className="text-xs text-zinc-500">({FIELD_TYPE_LABELS[f.type] ?? f.type}, sekcja {f.sectionKey}){!f.isActive && ' · wyłączone'}</span></span>
                  {f.isActive && <button type="button" aria-label="Wyłącz pole" disabled={busy} className="rounded p-2 text-red-400 hover:bg-zinc-800" onClick={() => run(() => apiClient(`/api/protocols/definitions/fields/${f.id}`, { method: 'DELETE' }))}><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-zinc-500">Usunięcie wyłącza pole/sekcję w nowych protokołach; dane już wpisane i zatwierdzone protokoły zostają.</p>
        </section>
        {error && <p className="rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end"><Button variant="ghost" onClick={onClose}>Zamknij</Button></div>
    </Modal>
  );
}
