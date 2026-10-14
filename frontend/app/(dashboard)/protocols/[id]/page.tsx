'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Copy, History, Loader2, Printer, Settings2, Trash2, FileDown, Calculator } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import {
  type AttachmentItem,
  type CalcConfig,
  type ProtocolDetail,
  type ProtocolSchema,
  type SectionDef,
  type UploadPayload,
  BAND_STYLES,
  STATUS_LABELS,
  STATUS_STYLES,
  daysLabel,
  errorMessage,
  formatDate,
  formatTime,
  isSectionVisible,
  todayYmd,
} from '@/lib/protocols';
import { SectionBody, type SectionCtx } from '@/components/protocols/ProtocolSections';
import { ProtocolGeneralStep, type ProtocolMeta } from '@/components/protocols/ProtocolGeneralStep';
import { ProtocolFinishStep } from '@/components/protocols/ProtocolFinishStep';
import {
  CalcConfigModal,
  DefinitionsModal,
  ImportBoardModal,
  InstrumentPickerModal,
  PrintMeasurementsModal,
  openPdf,
  type InstrumentOption,
} from '@/components/protocols/ProtocolModals';

type Data = Record<string, any>;
type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

const GENERAL = '__general';
const FINISH = '__finish';
const AUTOSAVE_MS = 1200;

const pad = (n: number) => String(n).padStart(2, '0');
const isoToLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localInputToIso = (v: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

function metaFrom(p: ProtocolDetail): ProtocolMeta {
  return {
    performedAt: p.performedAt ?? '',
    startedAt: isoToLocalInput(p.startedAt),
    finishedAt: isoToLocalInput(p.finishedAt),
    nextInspectionDate: p.nextInspectionDate ?? '',
    status: ['DRAFT', 'TODO', 'IN_PROGRESS', 'NEEDS_FIXES'].includes(p.status) ? p.status : 'IN_PROGRESS',
    description: p.description ?? '',
  };
}

export default function ProtocolEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, isPrivileged } = useAuth();

  const [schema, setSchema] = useState<ProtocolSchema | null>(null);
  const [calc, setCalc] = useState<CalcConfig | null>(null);
  const [detail, setDetail] = useState<ProtocolDetail | null>(null);
  const [data, setDataState] = useState<Data>({});
  const [meta, setMetaState] = useState<ProtocolMeta | null>(null);
  const [qualifications, setQualifications] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [active, setActive] = useState<string>(GENERAL);
  const [actionError, setActionError] = useState('');

  const [printOpen, setPrintOpen] = useState(false);
  const [importOpen, setImportOpen] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [defsOpen, setDefsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // --- Referencje do autosave (zawsze najnowsze wartości, bez ponownego tworzenia callbacków) ---
  const dataRef = useRef<Data>({});
  const metaRef = useRef<ProtocolMeta | null>(null);
  const baseRef = useRef<string>('');
  const dirtyRef = useRef(false);
  const savingRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictRef = useRef(false);
  const detailRef = useRef<ProtocolDetail | null>(null);
  const qualRef = useRef('');
  detailRef.current = detail;

  const readOnly = !detail || !detail.permissions.canEdit || !!detail.approvedAt || detail.isLegacy;

  // ------------------------------------------------------------------ ładowanie
  const applyProtocol = useCallback((p: ProtocolDetail) => {
    setDetail(p);
    detailRef.current = p;
    const d = (p.data ?? {}) as Data;
    dataRef.current = d;
    setDataState(d);
    const m = metaFrom(p);
    metaRef.current = m;
    setMetaState(m);
    baseRef.current = p.updatedAt;
    dirtyRef.current = false;
    conflictRef.current = false;
    const q = (d.signoff?.performer?.qualifications as string) ?? '';
    qualRef.current = q;
    setQualifications(q);
    setSaveState('saved');
  }, []);

  const loadSchema = useCallback(async () => {
    setSchema(await apiClient<ProtocolSchema>('/api/protocols/schema'));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, p, c] = await Promise.all([
          apiClient<ProtocolSchema>('/api/protocols/schema'),
          apiClient<ProtocolDetail>(`/api/protocols/${id}`),
          apiClient<CalcConfig>('/api/protocols/config').catch(() => null),
        ]);
        if (!alive) return;
        setSchema(s);
        setCalc(c);
        applyProtocol(p);
      } catch (e) {
        if (alive) setLoadError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, applyProtocol]);

  // ------------------------------------------------------------------ zapis
  const doSave = useCallback(async (): Promise<void> => {
    const p = detailRef.current;
    const m = metaRef.current;
    if (!p || !m || !dirtyRef.current || conflictRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    const approved = !!p.approvedAt;
    const body: Record<string, any> = { baseUpdatedAt: baseRef.current };
    if (approved) {
      if (m.nextInspectionDate) body.nextInspectionDate = m.nextInspectionDate;
    } else {
      body.autosave = true;
      body.data = dataRef.current;
      if (m.performedAt) body.performedAt = m.performedAt;
      const s = localInputToIso(m.startedAt);
      const f = localInputToIso(m.finishedAt);
      if (s) body.startedAt = s;
      if (f) body.finishedAt = f;
      if (m.nextInspectionDate) body.nextInspectionDate = m.nextInspectionDate;
      body.status = m.status;
      body.description = m.description;
    }
    try {
      const res = await apiClient<ProtocolDetail>(`/api/protocols/${p.id}`, { method: 'PATCH', body });
      baseRef.current = res.updatedAt;
      // Nie nadpisujemy lokalnych danych (użytkownik mógł już pisać dalej) — bierzemy tylko metadane z serwera.
      setDetail((cur) => (cur ? { ...cur, updatedAt: res.updatedAt, lastAutosaveAt: res.lastAutosaveAt, nextInspectionDate: res.nextInspectionDate, daysToNext: res.daysToNext, band: res.band, displayStatus: res.displayStatus, status: res.status, signatures: cur.signatures } : cur));
      setSaveError('');
      setSaveState(dirtyRef.current ? 'dirty' : 'saved');
    } catch (e: any) {
      dirtyRef.current = true;
      if (e?.status === 409) {
        conflictRef.current = true;
        setSaveState('conflict');
      } else {
        setSaveError(errorMessage(e));
        setSaveState('error');
      }
    }
  }, []);

  const runSave = useCallback((): Promise<void> => {
    if (savingRef.current) return savingRef.current;
    const pr = doSave().finally(() => {
      savingRef.current = null;
    });
    savingRef.current = pr;
    return pr;
  }, [doSave]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await runSave();
      if (dirtyRef.current && !conflictRef.current && saveStateIsRetryable()) schedule();
    }, AUTOSAVE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSave]);

  // Po błędzie sieci nie próbujemy w pętli — kolejna zmiana albo przycisk „Zapisz teraz” ponowi zapis.
  const saveStateIsRetryable = () => false;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState((s) => (s === 'conflict' ? s : 'dirty'));
    if (!conflictRef.current) schedule();
  }, [schedule]);

  /** Zapisuje natychmiast (przed wydrukiem, importem, zatwierdzeniem). Czeka na trwający zapis. */
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (savingRef.current) await savingRef.current;
    if (dirtyRef.current) await runSave();
    if (conflictRef.current) throw new Error('Protokół został zmieniony w innym miejscu — odśwież stronę.');
    if (dirtyRef.current) throw new Error('Nie udało się zapisać zmian — sprawdź połączenie i spróbuj ponownie.');
  }, [runSave]);

  const setData = useCallback(
    (fn: (d: Data) => Data) => {
      dataRef.current = fn(dataRef.current);
      setDataState(dataRef.current);
      markDirty();
    },
    [markDirty],
  );

  const onMeta = useCallback(
    (patch: Partial<ProtocolMeta>) => {
      metaRef.current = { ...(metaRef.current as ProtocolMeta), ...patch };
      setMetaState(metaRef.current);
      markDirty();
    },
    [markDirty],
  );

  const onQualifications = useCallback(
    (v: string) => {
      qualRef.current = v;
      setQualifications(v);
    },
    [],
  );

  // Ostrzeżenie przy zamykaniu karty z niezapisanymi zmianami + próba zapisu przy opuszczeniu strony
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => {
      window.removeEventListener('beforeunload', h);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current && !conflictRef.current) void doSave();
    };
  }, [doSave]);

  // ------------------------------------------------------------------ załączniki
  const uploadAttachment = useCallback(
    async (p: UploadPayload, fieldKey: string, kind?: string) => {
      setActionError('');
      try {
        await flush();
        const att = await apiClient<AttachmentItem>(`/api/protocols/${id}/attachments`, {
          method: 'POST',
          body: { fileName: p.fileName, mimeType: p.mimeType, base64: p.base64, fieldKey },
        });
        setDetail((cur) => (cur ? { ...cur, attachments: [...cur.attachments, kind ? { ...att, kind } : att] } : cur));
      } catch (e) {
        setActionError(errorMessage(e));
      }
    },
    [id, flush],
  );

  const removeAttachment = useCallback(
    async (attId: string) => {
      setActionError('');
      try {
        await apiClient(`/api/protocols/${id}/attachments/${attId}`, { method: 'DELETE' });
        setDetail((cur) => (cur ? { ...cur, attachments: cur.attachments.filter((a) => a.id !== attId) } : cur));
      } catch (e) {
        setActionError(errorMessage(e));
      }
    },
    [id],
  );

  // ------------------------------------------------------------------ sekcje
  const sections: SectionDef[] = useMemo(
    () => (schema ? schema.sections.filter((s) => isSectionVisible(s, detail?.objectType, data)) : []),
    [schema, detail?.objectType, data],
  );
  const nav = useMemo(
    () => [{ key: GENERAL, title: 'Dane ogólne' }, ...sections.map((s) => ({ key: s.key, title: s.title })), { key: FINISH, title: 'Podpisy i zatwierdzenie' }],
    [sections],
  );
  const activeIdx = Math.max(0, nav.findIndex((n) => n.key === active));
  const activeDef = sections.find((s) => s.key === active);

  useEffect(() => {
    if (nav.length && !nav.some((n) => n.key === active)) setActive(GENERAL);
  }, [nav, active]);

  const goTo = useCallback((key: string) => {
    setActive(key);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const ctx: SectionCtx | null = useMemo(
    () =>
      schema
        ? {
            schema,
            data,
            setData,
            readOnly,
            calc,
            isAdmin: user?.role === 'ADMIN',
            attachments: detail?.attachments ?? [],
            uploadAttachment,
            removeAttachment,
            onPickInstrument: () => setPickerOpen(true),
            onImportBoard: (k) => setImportOpen(k),
            canImportBoard: !!detail?.siteId,
            onOpenCalcConfig: () => setCalcOpen(true),
          }
        : null,
    [schema, data, setData, readOnly, calc, user?.role, detail?.attachments, detail?.siteId, uploadAttachment, removeAttachment],
  );

  const pickInstruments = (items: InstrumentOption[]) =>
    setData((d) => ({
      ...d,
      instruments: [
        ...(Array.isArray(d.instruments) ? d.instruments : []),
        ...items.map((i) => ({
          id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
          manufacturer: i.manufacturer || i.name,
          model: i.model,
          serialNumber: i.serialNumber,
          kind: i.name,
          certificateNumber: '',
          calibrationDate: '',
          validUntil: '',
          sourceAssetId: i.id,
        })),
      ],
    }));

  // ------------------------------------------------------------------ akcje nagłówka
  const createFromThis = async () => {
    if (!detail) return;
    setBusy('copy');
    setActionError('');
    try {
      await flush();
      const body: Record<string, any> = {
        objectType: detail.objectType ?? 'HOUSE',
        ...(detail.objectTypeName ? { objectTypeName: detail.objectTypeName } : {}),
        inspectionKind: 'PERIODIC',
        performedAt: todayYmd(),
        previousProtocolId: detail.id,
        ...(detail.siteId ? { siteId: detail.siteId } : { externalSite: detail.externalSite ?? {} }),
        ...(detail.performerExternal ? { performerExternal: detail.performerExternal } : { performerUserId: user?.id }),
      };
      const created = await apiClient<{ id: string }>('/api/protocols', { method: 'POST', body });
      router.push(`/protocols/${created.id}`);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!detail || !window.confirm(`Usunąć protokół ${detail.number}? Tej operacji nie można cofnąć.`)) return;
    setBusy('delete');
    try {
      dirtyRef.current = false;
      await apiClient(`/api/protocols/${detail.id}`, { method: 'DELETE' });
      router.push('/protocols');
    } catch (e) {
      setActionError(errorMessage(e));
      setBusy(null);
    }
  };

  const openLegacyPdf = () => {
    if (detail?.legacy?.pdfUrl) openPdf(detail.legacy.pdfUrl);
  };

  // ------------------------------------------------------------------ widok
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link href="/protocols" className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft className="h-4 w-4" />Protokoły</Link>
        <p className="rounded-lg bg-red-950/50 p-4 text-sm text-red-300">{loadError}</p>
      </div>
    );
  }
  if (!detail || !schema || !meta || !ctx) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>;
  }

  const statusKey = detail.displayStatus || detail.status;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-4" data-testid="protocol-editor">
      <Link href="/protocols" className="mb-3 inline-flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" /> Protokoły
      </Link>

      {/* Nagłówek */}
      <header className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-white">{detail.number}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLES[statusKey] ?? STATUS_STYLES.DRAFT}`}>{STATUS_LABELS[statusKey] ?? statusKey}</span>
              {detail.version > 1 && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">wersja {detail.version}</span>}
              {detail.isLegacy && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">stary pomiar (tylko odczyt)</span>}
            </div>
            <p className="mt-1 text-sm text-zinc-300">
              {detail.siteId ? <Link href={`/sites/${detail.siteId}?tab=protocols`} className="text-orange-400 hover:underline">{detail.site.name}</Link> : detail.site.name}
              {detail.site.address ? <span className="text-zinc-500"> · {detail.site.address}</span> : null}
            </p>
            <p className="text-xs text-zinc-500">
              {detail.objectTypeName || (detail.objectType ? schema.constants.objectTypes[detail.objectType] : '')}
              {detail.inspectionKind ? ` · ${detail.inspectionKindName || schema.constants.inspectionKinds[detail.inspectionKind]}` : ''}
              {detail.performedAt ? ` · ${formatDate(detail.performedAt)}` : ''}
            </p>
            {detail.nextInspectionDate && detail.band && (
              <p className={`mt-2 inline-block rounded-full px-3 py-1 text-xs ${BAND_STYLES[detail.band].chip}`}>
                Następne badanie: {formatDate(detail.nextInspectionDate)} · {daysLabel(detail.daysToNext)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!detail.isLegacy && (
              <Button variant="outline" onClick={() => setPrintOpen(true)}><Printer className="mr-2 h-4 w-4" />Drukuj pomiary</Button>
            )}
            {!detail.isLegacy && (
              <Button variant="outline" onClick={() => goTo(FINISH)}><FileDown className="mr-2 h-4 w-4" />Generuj PDF</Button>
            )}
            {!detail.isLegacy && (
              <Button variant="outline" disabled={busy === 'copy'} onClick={createFromThis}>
                {busy === 'copy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}Utwórz na podstawie poprzedniego
              </Button>
            )}
            {detail.isLegacy && detail.legacy?.pdfUrl && <Button variant="outline" onClick={openLegacyPdf}><FileDown className="mr-2 h-4 w-4" />Pobierz PDF</Button>}
            {detail.permissions.canManageDefinitions && !detail.isLegacy && (
              <>
                <Button variant="ghost" onClick={() => setDefsOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Własne pola</Button>
                <Button variant="ghost" onClick={() => setCalcOpen(true)}><Calculator className="mr-2 h-4 w-4" />Obliczenia</Button>
              </>
            )}
            {detail.permissions.canDelete && !detail.approvedAt && (
              <Button variant="ghost" className="text-red-400" disabled={busy === 'delete'} onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Usuń</Button>
            )}
          </div>
        </div>

        {detail.history.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
            <History className="h-3 w-3" /> Historia:
            {detail.history.map((h) => (
              <Link key={h.id} href={`/protocols/${h.id}`} className={`rounded-full px-2 py-0.5 ${h.id === detail.id ? 'bg-orange-900/40 text-orange-200' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                {h.year} · {h.number}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Stan zapisu */}
      {!readOnly && (
        <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 text-xs backdrop-blur" data-testid="save-bar">
          {saveState === 'conflict' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-red-300" role="alert">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Protokół został zmieniony na innym urządzeniu lub w innej karcie. Aby nie nadpisać cudzych zmian, zapis jest wstrzymany.</span>
              <Button size="sm" onClick={() => window.location.reload()}>Odśwież stronę</Button>
            </div>
          ) : saveState === 'error' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-amber-300">
              <span>Nie udało się zapisać{saveError ? `: ${saveError}` : ''}. Zmiany są na ekranie — spróbuj ponownie.</span>
              <Button size="sm" variant="outline" onClick={() => runSave()}>Zapisz teraz</Button>
            </div>
          ) : (
            <span className="text-zinc-500">
              {saveState === 'saving' ? 'Zapisywanie…' : saveState === 'dirty' ? 'Niezapisane zmiany…' : `Ostatni zapis: ${formatTime(detail.lastAutosaveAt || detail.updatedAt)}`}
            </span>
          )}
        </div>
      )}
      {readOnly && !detail.isLegacy && (
        <p className="mb-3 rounded-lg bg-zinc-900 p-3 text-xs text-zinc-400">
          {detail.approvedAt ? 'Protokół zatwierdzony — tylko do odczytu.' : 'Nie masz uprawnień do edycji tego protokołu.'}
        </p>
      )}
      {actionError && <p className="mb-3 rounded-lg bg-red-950/50 p-3 text-sm text-red-300" role="alert">{actionError}</p>}

      {detail.isLegacy ? (
        <section className="rounded-xl border border-zinc-800 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-100">Stary pomiar</h2>
          <p className="whitespace-pre-line text-sm text-zinc-300">{detail.legacy?.description || 'Brak opisu.'}</p>
          {detail.legacy?.results ? (
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">{JSON.stringify(detail.legacy.results, null, 2)}</pre>
          ) : null}
        </section>
      ) : (
        <>
          {/* Nawigacja po sekcjach */}
          <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-2" aria-label="Sekcje protokołu">
            {nav.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => goTo(n.key)}
                aria-current={n.key === active}
                className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm ${n.key === active ? 'border-orange-500 bg-orange-950/40 text-orange-100' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
              >
                {n.title}
              </button>
            ))}
          </nav>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4" data-testid="active-section">
            <h2 className="mb-4 text-base font-semibold text-white">{nav[activeIdx]?.title}</h2>
            {active === GENERAL && <ProtocolGeneralStep protocol={detail} meta={meta} onMeta={onMeta} readOnly={readOnly} />}
            {activeDef && <SectionBody def={activeDef} ctx={ctx} />}
            {active === FINISH && (
              <ProtocolFinishStep
                protocol={detail}
                nextInspectionDate={meta.nextInspectionDate}
                onNextDate={(v) => onMeta({ nextInspectionDate: v })}
                qualifications={qualifications}
                onQualifications={onQualifications}
                flush={flush}
                onProtocol={applyProtocol}
                onGoToSection={goTo}
              />
            )}
          </section>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" disabled={activeIdx === 0} onClick={() => goTo(nav[activeIdx - 1].key)}>
              <ChevronLeft className="mr-1 h-4 w-4" />{activeIdx > 0 ? nav[activeIdx - 1].title : 'Wstecz'}
            </Button>
            <Button disabled={activeIdx === nav.length - 1} onClick={() => goTo(nav[activeIdx + 1].key)}>
              {activeIdx < nav.length - 1 ? nav[activeIdx + 1].title : 'Dalej'}<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      <PrintMeasurementsModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        protocol={{ ...detail, data }}
        schema={schema}
        beforePrint={flush}
      />
      <ImportBoardModal
        open={importOpen !== null}
        onClose={() => setImportOpen(null)}
        protocolId={detail.id}
        defaultSection={importOpen ?? undefined}
        schema={schema}
        beforeImport={flush}
        onImported={(p) => applyProtocol(p)}
      />
      <InstrumentPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickInstruments} />
      <CalcConfigModal open={calcOpen} onClose={() => setCalcOpen(false)} onSaved={(c) => setCalc(c)} />
      <DefinitionsModal open={defsOpen} onClose={() => setDefsOpen(false)} schema={schema} onChanged={loadSchema} />
    </div>
  );
}
