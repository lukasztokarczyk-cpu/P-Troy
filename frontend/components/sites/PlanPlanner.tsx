'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, X, ZoomIn, ZoomOut, MousePointer2, Trash2, FileDown, ChevronLeft, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { fieldClass, labelClass } from '@/components/ui/modal';
import {
  PLAN_KINDS, FRAME_DEVICES, BOX_TYPES, MAX_FRAME_BOXES, kindOf, subtypeLabel, pointerToFraction, defaultFrame, resizeFrame,
  type PlanPoint, type PlanCircuit, type PlanSummary, type Frame, type FrameBox,
} from '@/lib/plan-catalog';

export interface PlannerPlan { id: string; fileName: string; fileType: string; fileUrl: string | null }

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const CLICK_SLOP_PX = 6; // ruch mniejszy niż to = kliknięcie, większy = przewijanie/przeciąganie
const MARKER_PX = 26;

type Tool = { kind: string; subtype: string } | null;
type Panel = 'point' | 'list' | 'summary';

// ---------------------------------------------------------------------------
// Pola pomocnicze
// ---------------------------------------------------------------------------

// Linie sterowania/okablowania: "A, B" -> ["A","B"]; zapis po opuszczeniu pola albo Enter
function LinesInput({ value, onCommit }: { value: string[]; onCommit: (lines: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => { setText(value.join(', ')); }, [value]);
  const commit = () => {
    const lines = [...new Set(text.split(/[,;\s]+/).map((l) => l.trim()).filter(Boolean))].slice(0, 8);
    if (lines.join('|') !== value.join('|')) onCommit(lines);
    setText(lines.join(', '));
  };
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder="np. A, B"
      className={fieldClass}
    />
  );
}

function CircuitSelect({ value, circuits, onChange }: { value: string | null; circuits: PlanCircuit[]; onChange: (id: string | null) => void }) {
  const missing = value && !circuits.some((c) => c.id === value);
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={fieldClass}>
      <option value="">— brak obwodu —</option>
      {missing && <option value={value!}>Usunięty obwód</option>}
      {circuits.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Główny komponent
// ---------------------------------------------------------------------------

export function PlanPlanner({ siteId, plan, onClose }: { siteId: string; plan: PlannerPlan; onClose: () => void }) {
  const isPdf = plan.fileType === 'application/pdf' || /\.pdf$/i.test(plan.fileName);

  const [points, setPoints] = useState<PlanPoint[]>([]);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [circuits, setCircuits] = useState<PlanCircuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('point');
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  // --- wymiary strony rzutu ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(800);
  const [aspect, setAspect] = useState(1.414); // wysokość / szerokość strony
  const [pageReady, setPageReady] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const boxWidth = Math.round(baseWidth * zoom);

  // ---------------- dane ----------------
  const reload = useCallback(async () => {
    try {
      const [list, circ] = await Promise.all([
        apiClient<{ points: PlanPoint[]; summary: PlanSummary }>(`/api/sites/${siteId}/plan-points`),
        apiClient<PlanCircuit[]>(`/api/sites/${siteId}/plan-circuits`),
      ]);
      setPoints(list.points);
      setSummary(list.summary);
      setCircuits(circ);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Nie udało się pobrać punktów.');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { reload(); }, [reload]);

  const refreshSummary = useCallback(async () => {
    try {
      const list = await apiClient<{ points: PlanPoint[]; summary: PlanSummary }>(`/api/sites/${siteId}/plan-points`);
      setSummary(list.summary);
    } catch { /* zestawienie odświeży się przy kolejnej zmianie */ }
  }, [siteId]);

  // ---------------- zapis zmian (z opóźnieniem, scalane per punkt) ----------------
  const pending = useRef<Map<string, { patch: Record<string, unknown>; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const [saving, setSaving] = useState(0);

  const sendPatch = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setSaving((n) => n + 1);
    try {
      const updated = await apiClient<PlanPoint>(`/api/plan-points/${id}`, { method: 'PATCH', body: patch });
      // serwer mógł zmienić numer (zmiana serii po zmianie podtypu) — bierzemy prefiks/numer/kod z odpowiedzi
      setPoints((ps) => ps.map((p) => (p.id === id ? { ...p, prefix: updated.prefix, seq: updated.seq, code: updated.code, subtype: updated.subtype } : p)));
      refreshSummary();
    } catch (err: any) {
      setError(err.message || 'Nie udało się zapisać zmian.');
      reload();
    } finally {
      setSaving((n) => n - 1);
    }
  }, [refreshSummary, reload]);

  const flush = useCallback((id?: string) => {
    for (const [pid, entry] of [...pending.current.entries()]) {
      if (id && pid !== id) continue;
      clearTimeout(entry.timer);
      pending.current.delete(pid);
      sendPatch(pid, entry.patch);
    }
  }, [sendPatch]);

  // zmiana lokalnie od razu, zapis na serwer po 600 ms bez kolejnych zmian
  const updatePoint = useCallback((id: string, patch: Partial<PlanPoint>, immediate = false) => {
    setPoints((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const existing = pending.current.get(id);
    if (existing) clearTimeout(existing.timer);
    const merged = { ...(existing?.patch ?? {}), ...patch };
    const timer = setTimeout(() => {
      const e = pending.current.get(id);
      if (!e) return;
      pending.current.delete(id);
      sendPatch(id, e.patch);
    }, immediate ? 0 : 600);
    pending.current.set(id, { patch: merged, timer });
  }, [sendPatch]);

  useEffect(() => () => { flush(); }, [flush]);

  // ---------------- PDF / obraz ----------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBaseWidth(Math.max(320, el.clientWidth - 24));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // wczytanie dokumentu PDF raz
  useEffect(() => {
    if (!isPdf || !plan.fileUrl) return;
    let cancelled = false;
    (async () => {
      try {
        setPageError(null);
        const pdfjs: any = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
        const res = await fetch(plan.fileUrl!);
        if (!res.ok) throw new Error(`Pobieranie pliku nie powiodło się (${res.status})`);
        const data = await res.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) { doc.destroy(); return; }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1);
      } catch (err: any) {
        if (!cancelled) setPageError(err.message || 'Nie udało się wczytać pliku PDF.');
      }
    })();
    return () => {
      cancelled = true;
      try { renderTaskRef.current?.cancel(); } catch { /* ignoruj */ }
      pdfDocRef.current?.destroy?.();
      pdfDocRef.current = null;
    };
  }, [isPdf, plan.fileUrl]);

  // rysowanie strony PDF (ponownie przy zmianie strony i powiększenia — ostrość)
  useEffect(() => {
    if (!isPdf) return;
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || numPages < 1) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        try { renderTaskRef.current?.cancel(); } catch { /* ignoruj */ }
        const pg = await doc.getPage(page);
        if (cancelled) return;
        const base = pg.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.min(boxWidth * dpr, 4096);
        const viewport = pg.getViewport({ scale: targetWidth / base.width });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const task = pg.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setPageReady(true);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) setPageError(err.message || 'Nie udało się narysować strony.');
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isPdf, page, boxWidth, numPages, pageError]);

  // ---------------- punkty na bieżącej stronie ----------------
  const pagePoints = useMemo(() => points.filter((p) => p.planId === plan.id && p.page === page), [points, plan.id, page]);
  const planPoints = useMemo(() => points.filter((p) => p.planId === plan.id), [points, plan.id]);
  const selected = useMemo(() => points.find((p) => p.id === selectedId) ?? null, [points, selectedId]);

  const selectPoint = useCallback((id: string | null) => {
    if (selectedId && selectedId !== id) flush(selectedId);
    setSelectedId(id);
    if (id) setPanel('point');
  }, [selectedId, flush]);

  // ---------------- stawianie punktu ----------------
  const placeAt = useCallback(async (clientX: number, clientY: number) => {
    if (!tool || !boxRef.current || busy) return;
    const frac = pointerToFraction(clientX, clientY, boxRef.current.getBoundingClientRect());
    if (!frac) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { x: frac.x, y: frac.y, page, kind: tool.kind, subtype: tool.subtype };
      if (tool.kind === 'FRAME') body.frame = defaultFrame(1);
      const created = await apiClient<PlanPoint>(`/api/sites/${siteId}/plans/${plan.id}/points`, { method: 'POST', body });
      setPoints((ps) => [...ps, created]);
      setSelectedId(created.id);
      setPanel('point');
      refreshSummary();
    } catch (err: any) {
      setError(err.message || 'Nie udało się dodać punktu.');
    } finally {
      setBusy(false);
    }
  }, [tool, busy, page, siteId, plan.id, refreshSummary]);

  // kliknięcie na pustym miejscu planu: punkt stawiamy dopiero przy puszczeniu, jeśli palec/mysz prawie się nie ruszyły
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const onOverlayDown = (e: React.PointerEvent) => { downRef.current = { x: e.clientX, y: e.clientY }; };
  const onOverlayUp = (e: React.PointerEvent) => {
    const d = downRef.current;
    downRef.current = null;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP_PX) return;
    if (tool) placeAt(e.clientX, e.clientY);
    else selectPoint(null);
  };

  // ---------------- przeciąganie punktu ----------------
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const onMarkerDown = (e: React.PointerEvent, p: PlanPoint) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: p.id, startX: e.clientX, startY: e.clientY, moved: false };
    selectPoint(p.id);
  };
  const onMarkerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !boxRef.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < CLICK_SLOP_PX) return;
    d.moved = true;
    const frac = pointerToFraction(e.clientX, e.clientY, boxRef.current.getBoundingClientRect());
    if (frac) setPoints((ps) => ps.map((p) => (p.id === d.id ? { ...p, x: frac.x, y: frac.y } : p)));
  };
  const onMarkerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.moved || !boxRef.current) return;
    const frac = pointerToFraction(e.clientX, e.clientY, boxRef.current.getBoundingClientRect());
    if (frac) updatePoint(d.id, { x: frac.x, y: frac.y }, true);
  };

  // ---------------- usuwanie / klawiatura ----------------
  const deletePoint = useCallback(async (p: PlanPoint) => {
    if (!window.confirm(`Usunąć punkt ${p.code}?`)) return;
    const pend = pending.current.get(p.id);
    if (pend) { clearTimeout(pend.timer); pending.current.delete(p.id); }
    try {
      await apiClient(`/api/plan-points/${p.id}`, { method: 'DELETE' });
      setPoints((ps) => ps.filter((x) => x.id !== p.id));
      setSelectedId(null);
      refreshSummary();
    } catch (err: any) {
      setError(err.message || 'Nie udało się usunąć punktu.');
    }
  }, [refreshSummary]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') { if (tool) setTool(null); else if (selectedId) selectPoint(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !typing) { e.preventDefault(); deletePoint(selected); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, selectedId, selected, selectPoint, deletePoint]);

  const closeAll = async () => { flush(); onClose(); };

  const exportPdf = async () => {
    flush();
    setExporting(true);
    setPdfUrl(null);
    try {
      // krótka pauza, żeby niezapisane zmiany zdążyły dojść do serwera przed generowaniem listy
      await new Promise((r) => setTimeout(r, 700));
      const res = await apiClient<{ pdfUrl: string }>(`/api/sites/${siteId}/plan-points/pdf`);
      setPdfUrl(res.pdfUrl);
      window.open(res.pdfUrl, '_blank', 'noopener');
    } catch (err: any) {
      setError(err.message || 'Nie udało się wygenerować listy PDF.');
    } finally {
      setExporting(false);
    }
  };

  const zoomBy = (dir: 1 | -1) => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001);
    const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, (idx === -1 ? 2 : idx) + dir));
    setZoom(ZOOM_STEPS[next]);
  };

  // ---------------- edycja wybranego punktu ----------------
  const updateFrame = (p: PlanPoint, frame: Frame, immediate = true) => updatePoint(p.id, { frame }, immediate);
  const updateBox = (p: PlanPoint, i: number, patch: Partial<FrameBox>, immediate = true) => {
    const frame = p.frame ?? defaultFrame(1);
    updateFrame(p, { ...frame, boxes: frame.boxes.map((b, j) => (j === i ? { ...b, ...patch } : b)) }, immediate);
  };

  const imageHeight = Math.round(boxWidth * aspect);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* ---- pasek górny ---- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Planuj instalację</p>
          <p className="truncate text-xs text-zinc-500">{plan.fileName}</p>
        </div>
        {isPdf && numPages > 1 && (
          <div className="flex items-center gap-1 text-xs text-zinc-300">
            <button onClick={() => { setPage((p) => Math.max(1, p - 1)); setPageReady(false); }} disabled={page <= 1} className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span>Strona {page} / {numPages}</span>
            <button onClick={() => { setPage((p) => Math.min(numPages, p + 1)); setPageReady(false); }} disabled={page >= numPages} className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-zinc-300">
          <button onClick={() => zoomBy(-1)} className="rounded p-1.5 hover:bg-zinc-800" title="Pomniejsz"><ZoomOut className="h-4 w-4" /></button>
          <button onClick={() => setZoom(1)} className="min-w-[44px] rounded px-1 py-1 hover:bg-zinc-800" title="Dopasuj do szerokości">{Math.round(zoom * 100)}%</button>
          <button onClick={() => zoomBy(1)} className="rounded p-1.5 hover:bg-zinc-800" title="Powiększ"><ZoomIn className="h-4 w-4" /></button>
        </div>
        <span className="text-xs text-zinc-600">{saving > 0 ? 'Zapisywanie…' : 'Zapisano'}</span>
        <button onClick={exportPdf} disabled={exporting} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-orange-600/50 disabled:opacity-50">
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Lista punktów PDF
        </button>
        {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-orange-400 underline">Otwórz PDF</a>}
        <button onClick={closeAll} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Zamknij"><X className="h-5 w-5" /></button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-950/60 px-3 py-1.5 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ---- paleta ---- */}
        <aside className="max-h-40 shrink-0 overflow-y-auto border-b border-zinc-800 bg-zinc-900/60 p-2 lg:max-h-none lg:w-56 lg:border-b-0 lg:border-r">
          <button
            onClick={() => setTool(null)}
            className={`mb-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${!tool ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-zinc-800 text-zinc-300 hover:border-zinc-700'}`}
          >
            <MousePointer2 className="h-4 w-4" /> Zaznaczaj i przesuwaj
          </button>
          <p className="mb-1 px-1 text-[10px] uppercase tracking-wide text-zinc-600">Dodaj punkt na planie</p>
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {PLAN_KINDS.map((k) => {
              const Icon = k.icon;
              const active = tool?.kind === k.key;
              return (
                <div key={k.key}>
                  <button
                    onClick={() => setTool({ kind: k.key, subtype: active ? tool!.subtype : k.subtypes[0].key })}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs ${active ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-zinc-800 text-zinc-300 hover:border-zinc-700'}`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: k.color }}><Icon className="h-3 w-3 text-white" /></span>
                    <span className="truncate">{k.label}</span>
                  </button>
                  {active && k.subtypes.length > 1 && (
                    <div className="mb-1 mt-1 flex flex-wrap gap-1 pl-2">
                      {k.subtypes.map((s) => (
                        <button key={s.key} onClick={() => setTool({ kind: k.key, subtype: s.key })}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${tool!.subtype === s.key ? 'border-orange-500 bg-orange-500/20 text-orange-200' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ---- plan ---- */}
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-zinc-800/40 p-3">
          {tool && (
            <div className="pointer-events-none sticky left-0 top-0 z-20 mb-2 inline-block rounded-md bg-orange-600/90 px-2.5 py-1 text-xs text-white shadow">
              Kliknij na planie, aby dodać: {subtypeLabel(tool.kind, tool.subtype) || kindOf(tool.kind)?.label} · Esc kończy
            </div>
          )}
          {pageError ? (
            <div className="mx-auto mt-10 max-w-md rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
              <p className="mb-1 font-medium">Nie można wyświetlić rzutu</p>
              <p className="text-xs">{pageError}</p>
              {plan.fileUrl && <a href={plan.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-orange-400 underline">Otwórz plik w nowej karcie</a>}
            </div>
          ) : !plan.fileUrl ? (
            <p className="mt-10 text-center text-sm text-zinc-500">Plik rzutu jest niedostępny.</p>
          ) : (
            <div
              ref={boxRef}
              className="relative mx-auto select-none bg-white shadow-xl"
              style={{ width: boxWidth, height: isPdf ? imageHeight : undefined }}
            >
              {isPdf ? (
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={plan.fileUrl}
                  alt={plan.fileName}
                  draggable={false}
                  className="block h-auto w-full"
                  onLoad={(e) => { setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth); setPageReady(true); }}
                  onError={() => setPageError('Nie udało się wczytać obrazu rzutu.')}
                />
              )}
              {!pageReady && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}

              {/* warstwa kliknięć + punkty */}
              <div
                className="absolute inset-0"
                style={{ cursor: tool ? 'crosshair' : 'default', touchAction: 'pan-x pan-y pinch-zoom' }}
                onPointerDown={onOverlayDown}
                onPointerUp={onOverlayUp}
                onPointerCancel={() => { downRef.current = null; }}
              >
                {pageReady && pagePoints.map((p) => {
                  const k = kindOf(p.kind);
                  const Icon = k?.icon;
                  const isSel = p.id === selectedId;
                  return (
                    <div
                      key={p.id}
                      onPointerDown={(e) => onMarkerDown(e, p)}
                      onPointerMove={onMarkerMove}
                      onPointerUp={onMarkerUp}
                      onPointerCancel={() => { dragRef.current = null; }}
                      className="absolute flex flex-col items-center"
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)', touchAction: 'none', cursor: 'grab', zIndex: isSel ? 10 : 1 }}
                    >
                      <span
                        className="flex items-center justify-center rounded-full border-2 shadow"
                        style={{ width: MARKER_PX, height: MARKER_PX, backgroundColor: k?.color ?? '#71717a', borderColor: isSel ? '#fff' : 'rgba(0,0,0,0.55)', boxShadow: isSel ? '0 0 0 3px #f97316' : undefined }}
                      >
                        {Icon && <Icon className="h-3.5 w-3.5 text-white" />}
                      </span>
                      <span className="mt-0.5 whitespace-nowrap rounded bg-black/75 px-1 text-[10px] font-semibold leading-4 text-white">{p.code}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ---- panel prawy ---- */}
        <aside className="flex max-h-[45vh] shrink-0 flex-col border-t border-zinc-800 bg-zinc-900/60 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
          <div className="flex border-b border-zinc-800 text-xs">
            {([['point', 'Punkt'], ['list', `Lista (${planPoints.length})`], ['summary', 'Zestawienie']] as [Panel, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setPanel(key)} className={`flex-1 px-2 py-2 ${panel === key ? 'border-b-2 border-orange-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{label}</button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? (
              <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-zinc-600" />
            ) : panel === 'point' ? (
              !selected ? (
                <p className="text-xs leading-relaxed text-zinc-500">
                  Wybierz rodzaj punktu po lewej i kliknij w dowolne miejsce rzutu. Punkt można przeciągnąć, a po kliknięciu ustawić jego obwód, linie, puszkę i uwagi.
                </p>
              ) : (
                <PointEditor
                  point={selected}
                  circuits={circuits}
                  onChange={(patch, immediate) => updatePoint(selected.id, patch, immediate)}
                  onFrame={(frame, immediate) => updateFrame(selected, frame, immediate)}
                  onBox={(i, patch, immediate) => updateBox(selected, i, patch, immediate)}
                  onDelete={() => deletePoint(selected)}
                />
              )
            ) : panel === 'list' ? (
              planPoints.length === 0 ? (
                <p className="text-xs text-zinc-500">Na tym rzucie nie ma jeszcze punktów.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {[...planPoints].sort((a, b) => a.page - b.page || a.prefix.localeCompare(b.prefix) || a.seq - b.seq).map((p) => {
                    const k = kindOf(p.kind);
                    const circ = circuits.find((c) => c.id === p.circuitDeviceId);
                    return (
                      <li key={p.id}>
                        <button onClick={() => { setPage(p.page); setSelectedId(p.id); setPanel('point'); }} className="flex w-full items-center gap-2 py-1.5 text-left text-xs hover:bg-zinc-800/50">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: k?.color }} />
                          <span className="w-14 shrink-0 font-semibold text-zinc-200">{p.code}</span>
                          <span className="min-w-0 flex-1 truncate text-zinc-400">{p.kind === 'FRAME' ? `Ramka ${p.frame?.count ?? 1}-krotna` : subtypeLabel(p.kind, p.subtype)}</span>
                          <span className="max-w-[40%] truncate text-zinc-600">{p.kind === 'FRAME' ? '' : circ ? circ.description ?? circ.label : '—'}</span>
                          {p.page > 1 && <span className="shrink-0 text-zinc-600">s.{p.page}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <SummaryView summary={summary} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edytor wybranego punktu
// ---------------------------------------------------------------------------

function PointEditor({ point, circuits, onChange, onFrame, onBox, onDelete }: {
  point: PlanPoint;
  circuits: PlanCircuit[];
  onChange: (patch: Partial<PlanPoint>, immediate?: boolean) => void;
  onFrame: (frame: Frame, immediate?: boolean) => void;
  onBox: (i: number, patch: Partial<FrameBox>, immediate?: boolean) => void;
  onDelete: () => void;
}) {
  const k = kindOf(point.kind);
  const isFrame = point.kind === 'FRAME';
  const frame = point.frame ?? defaultFrame(1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: k?.color }}>{k && <k.icon className="h-3.5 w-3.5 text-white" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{point.code}</p>
          <p className="truncate text-xs text-zinc-500">{k?.label}</p>
        </div>
        <button onClick={onDelete} className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-950 hover:text-red-400" title="Usuń punkt"><Trash2 className="h-4 w-4" /></button>
      </div>

      {k && k.subtypes.length > 1 && (
        <div>
          <label className={labelClass}>Rodzaj</label>
          <select value={point.subtype ?? ''} onChange={(e) => onChange({ subtype: e.target.value }, true)} className={fieldClass}>
            {k.subtypes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <p className="mt-0.5 text-[11px] text-zinc-600">Zmiana rodzaju może nadać nowy numer (inna seria).</p>
        </div>
      )}

      {isFrame ? (
        <>
          <div>
            <label className={labelClass}>Liczba puszek w ramce</label>
            <div className="flex gap-1">
              {Array.from({ length: MAX_FRAME_BOXES }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => onFrame(resizeFrame(frame, n), true)}
                  className={`h-8 w-8 rounded-lg border text-sm ${frame.count === n ? 'border-orange-500 bg-orange-500/20 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Układ</label>
              <select value={frame.orientation} onChange={(e) => onFrame({ ...frame, orientation: e.target.value as Frame['orientation'] }, true)} className={fieldClass}>
                <option value="HORIZONTAL">Pozioma</option>
                <option value="VERTICAL">Pionowa</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Styl ramki</label>
              <input value={frame.style} onChange={(e) => onFrame({ ...frame, style: e.target.value }, false)} placeholder="np. Simon 10" className={fieldClass} />
            </div>
          </div>

          {frame.boxes.map((b, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-zinc-800 p-2.5">
              <p className="text-xs font-semibold text-zinc-300">Puszka {i + 1}</p>
              <div>
                <label className={labelClass}>Osprzęt</label>
                <select value={b.device} onChange={(e) => onBox(i, { device: e.target.value }, true)} className={fieldClass}>
                  {FRAME_DEVICES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Obwód</label>
                <CircuitSelect value={b.circuitDeviceId} circuits={circuits} onChange={(id) => onBox(i, { circuitDeviceId: id }, true)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Linie</label>
                  <LinesInput value={b.lines} onCommit={(lines) => onBox(i, { lines }, true)} />
                </div>
                <div>
                  <label className={labelClass}>Styl osprzętu</label>
                  <input value={b.style} onChange={(e) => onBox(i, { style: e.target.value }, false)} placeholder="opcjonalnie" className={fieldClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Puszka</label>
                <select value={b.boxType ?? ''} onChange={(e) => onBox(i, { boxType: e.target.value || null }, true)} className={fieldClass}>
                  <option value="">— nie wybrano —</option>
                  {BOX_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={b.smart} onChange={(e) => onBox(i, { smart: e.target.checked }, true)} className="accent-orange-500" /> Sterowanie smart
              </label>
            </div>
          ))}
        </>
      ) : (
        <>
          <div>
            <label className={labelClass}>Obwód</label>
            <CircuitSelect value={point.circuitDeviceId} circuits={circuits} onChange={(id) => onChange({ circuitDeviceId: id }, true)} />
            {circuits.length === 0 && <p className="mt-0.5 text-[11px] text-zinc-600">Brak obwodów — dodaj aparaty w zakładce Rozdzielnie, aby je tu przypisywać.</p>}
          </div>
          <div>
            <label className={labelClass}>Linie</label>
            <LinesInput value={point.lines} onCommit={(lines) => onChange({ lines }, true)} />
          </div>
          <div>
            <label className={labelClass}>Puszka</label>
            <select value={point.boxType ?? ''} onChange={(e) => onChange({ boxType: e.target.value || null }, true)} className={fieldClass}>
              <option value="">— nie wybrano —</option>
              {BOX_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={point.smart} onChange={(e) => onChange({ smart: e.target.checked }, true)} className="accent-orange-500" /> Sterowanie smart
          </label>
        </>
      )}

      <div>
        <label className={labelClass}>Uwagi</label>
        <textarea
          value={point.note ?? ''}
          onChange={(e) => onChange({ note: e.target.value }, false)}
          rows={2}
          placeholder="np. wysokość montażu, dodatkowe informacje"
          className={fieldClass}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zestawienie (liczone przez serwer — te same liczby trafiają do PDF)
// ---------------------------------------------------------------------------

function SummaryView({ summary }: { summary: PlanSummary | null }) {
  if (!summary) return null;
  if (summary.total === 0) return <p className="text-xs text-zinc-500">Zestawienie pojawi się po dodaniu pierwszych punktów.</p>;
  const section = (title: string, rows: { label: string; count: number }[]) =>
    rows.length === 0 ? null : (
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold text-zinc-300">{title}</p>
        <ul className="divide-y divide-zinc-800">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start justify-between gap-3 py-1 text-xs">
              <span className="text-zinc-400">{r.label}</span>
              <span className="shrink-0 font-semibold text-zinc-200">{r.count} szt.</span>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div>
      <p className="mb-3 text-xs text-zinc-400">Łącznie punktów na wszystkich rzutach budowy: <span className="font-semibold text-white">{summary.total}</span></p>
      {summary.noCircuit > 0 && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-950/40 px-2.5 py-1.5 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {summary.noCircuit} pozycji (gniazda, lampy, rolety, łączniki) nie ma przypisanego obwodu.
        </p>
      )}
      {section('Punkty', summary.points)}
      {section('Ramki na osprzęt', summary.frames)}
      {section('Osprzęt w ramkach', summary.devices)}
      {section('Puszki', summary.boxes)}
    </div>
  );
}
