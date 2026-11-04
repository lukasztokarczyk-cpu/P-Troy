'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';

export interface ViewerPhoto { src: string; name?: string }

interface View { s: number; x: number; y: number }
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const BUTTON_STEP = 1.5;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Pełnoekranowa przeglądarka zdjęć (Android / iOS / komputer):
 * pinch-to-zoom, przesuwanie powiększonego zdjęcia, podwójne dotknięcie/kliknięcie, kółko myszy, przyciski + − ⟲,
 * poprzednie/następne (przyciski, strzałki, przesunięcie palcem przy braku powiększenia), zamknięcie WYŁĄCZNIE przyciskiem X lub Esc
 * (gesty i kliknięcie w tło nigdy nie zamykają podglądu). Renderowana w portalu na <body>, więc żaden element nadrzędny
 * (overlay modala, transform, overflow) nie przechwyci dotknięć.
 */
export function PhotoViewer({ photos, index, onIndexChange, onClose }: { photos: ViewerPhoto[]; index: number; onIndexChange: (i: number) => void; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<View>({ s: 1, x: 0, y: 0 });
  const [view, setViewState] = useState<View>({ s: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const total = photos.length;
  const photo = photos[index];

  /** Ustawia widok z ograniczeniem: zdjęcie nie może „uciec” poza ekran. */
  const setView = useCallback((v: View, anim = false) => {
    const stage = stageRef.current;
    const img = imgRef.current;
    const s = clamp(v.s, MIN_SCALE, MAX_SCALE);
    let { x, y } = v;
    if (stage && img) {
      const maxX = Math.max(0, (img.offsetWidth * s - stage.clientWidth) / 2);
      const maxY = Math.max(0, (img.offsetHeight * s - stage.clientHeight) / 2);
      x = clamp(x, -maxX, maxX);
      y = clamp(y, -maxY, maxY);
    }
    if (s <= MIN_SCALE) { x = 0; y = 0; }
    const next = { s, x, y };
    viewRef.current = next;
    setAnimate(anim);
    setViewState(next);
  }, []);

  /** Zmienia skalę tak, by punkt (cx, cy) — względem środka ekranu — został w tym samym miejscu zdjęcia. */
  const zoomAt = useCallback((ns: number, cx: number, cy: number, anim = false) => {
    const { s, x, y } = viewRef.current;
    const target = clamp(ns, MIN_SCALE, MAX_SCALE);
    const k = target / s;
    setView({ s: target, x: cx - (cx - x) * k, y: cy - (cy - y) * k }, anim);
  }, [setView]);

  const zoomCenter = (factor: number) => zoomAt(viewRef.current.s * factor, 0, 0, true);
  const reset = () => setView({ s: 1, x: 0, y: 0 }, true);
  const go = useCallback((d: number) => {
    if (total < 2) return;
    onIndexChange((index + d + total) % total);
  }, [index, total, onIndexChange]);

  useEffect(() => { setMounted(true); }, []);

  // nowe zdjęcie → wyzeruj powiększenie
  useEffect(() => {
    viewRef.current = { s: 1, x: 0, y: 0 };
    setViewState({ s: 1, x: 0, y: 0 });
    setLoaded(false);
    setFailed(false);
  }, [index, photo?.src]);

  // blokada przewijania strony pod spodem
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // klawiatura
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') zoomCenter(BUTTON_STEP);
      else if (e.key === '-' || e.key === '_') zoomCenter(1 / BUTTON_STEP);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, onClose]);

  // kółko myszy (musi być nasłuchiwane jako nie-pasywne, inaczej nie da się zablokować przewijania strony) + gesty iOS Safari
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2);
      const cy = e.clientY - (r.top + r.height / 2);
      zoomAt(viewRef.current.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), cx, cy);
    };
    const stop = (e: Event) => e.preventDefault(); // iOS: gesturestart/change = pinch całej strony
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', stop as EventListener);
    el.addEventListener('gesturechange', stop as EventListener);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', stop as EventListener);
      el.removeEventListener('gesturechange', stop as EventListener);
    };
  }, [zoomAt, mounted]);

  // ---------------- gesty wskaźnikowe (dotyk, mysz, rysik) ----------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    pinch: null as null | { dist: number; s: number; mid: { x: number; y: number }; x: number; y: number },
    pan: null as null | { px: number; py: number; x: number; y: number },
    tap: null as null | { t: number; x: number; y: number; moved: boolean; multi: boolean },
    lastTap: null as null | { t: number; x: number; y: number },
  });

  const center = () => {
    const r = stageRef.current!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const startPan = (p: { x: number; y: number }) => {
    const v = viewRef.current;
    gesture.current.pan = { px: p.x, py: p.y, x: v.x, y: v.y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* niektóre przeglądarki */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.tap = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false, multi: false };
      startPan({ x: e.clientX, y: e.clientY });
      g.pinch = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const v = viewRef.current;
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: v.s, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, x: v.x, y: v.y };
      g.pan = null;
      if (g.tap) g.tap.multi = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.tap && Math.hypot(e.clientX - g.tap.x, e.clientY - g.tap.y) > 10) g.tap.moved = true;

    if (pointers.current.size >= 2 && g.pinch) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const { cx, cy } = center();
      const ns = clamp(g.pinch.s * (dist / g.pinch.dist), MIN_SCALE, MAX_SCALE);
      // punkt zdjęcia, który był pod środkiem palców na starcie, ma zostać pod środkiem palców teraz
      const p0 = { x: g.pinch.mid.x - cx, y: g.pinch.mid.y - cy };
      const q = { x: (p0.x - g.pinch.x) / g.pinch.s, y: (p0.y - g.pinch.y) / g.pinch.s };
      setView({ s: ns, x: mid.x - cx - q.x * ns, y: mid.y - cy - q.y * ns });
    } else if (pointers.current.size === 1 && g.pan && viewRef.current.s > 1) {
      setView({ s: viewRef.current.s, x: g.pan.x + (e.clientX - g.pan.px), y: g.pan.y + (e.clientY - g.pan.py) });
    }
  };

  const endPointer = (e: React.PointerEvent, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignoruj */ }
    const g = gesture.current;

    if (pointers.current.size === 1) {
      // z pinch wracamy do przesuwania jednym palcem bez „skoku”
      g.pinch = null;
      startPan(Array.from(pointers.current.values())[0]);
      return;
    }
    if (pointers.current.size > 0) return;

    g.pinch = null; g.pan = null;
    const tap = g.tap; g.tap = null;
    if (cancelled || !tap) return;
    const dx = e.clientX - tap.x;
    const dy = e.clientY - tap.y;

    // przesunięcie poziome przy braku powiększenia → poprzednie/następne zdjęcie
    if (!tap.multi && viewRef.current.s <= 1.02 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);
      g.lastTap = null;
      return;
    }
    // szybkie, nieruchome dotknięcie → ewentualne podwójne dotknięcie
    if (!tap.multi && !tap.moved && Date.now() - tap.t < 350) {
      const now = Date.now();
      const last = g.lastTap;
      if (last && now - last.t < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 35) {
        g.lastTap = null;
        const { cx, cy } = center();
        if (viewRef.current.s > 1.05) setView({ s: 1, x: 0, y: 0 }, true);
        else zoomAt(DOUBLE_TAP_SCALE, e.clientX - cx, e.clientY - cy, true);
      } else {
        g.lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  };

  if (!mounted || !photo) return null;
  const zoomed = view.s > 1.01;

  const btn = 'flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900/90 text-zinc-100 ring-1 ring-zinc-700 transition-colors hover:bg-orange-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40 disabled:hover:bg-zinc-900/90';

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black" role="dialog" aria-modal="true" aria-label="Podgląd zdjęcia" data-testid="photo-viewer">
      {/* scena: tu odbywają się wszystkie gesty; przyciski są RODZEŃSTWEM sceny, więc nie przechwytują ani nie blokują dotyku */}
      <div
        ref={stageRef}
        data-testid="pv-stage"
        className="absolute inset-0 flex select-none items-center justify-center overflow-hidden"
        style={{ touchAction: 'none', cursor: zoomed ? 'grab' : 'zoom-in' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          key={photo.src}
          src={photo.src}
          alt={photo.name ?? 'Zdjęcie'}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          data-testid="pv-img"
          className="max-h-full max-w-full object-contain"
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`,
            transformOrigin: 'center center',
            transition: animate ? 'transform 180ms ease-out' : 'none',
            opacity: loaded ? 1 : 0,
            willChange: 'transform',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
        />
        {!loaded && !failed && <p className="pointer-events-none absolute text-sm text-zinc-500">Ładowanie zdjęcia…</p>}
        {failed && <p className="pointer-events-none absolute px-6 text-center text-sm text-red-300" data-testid="pv-error">Nie udało się wczytać zdjęcia.</p>}
      </div>

      {/* górny pasek */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="pointer-events-auto min-w-0 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-zinc-800">
          <span data-testid="pv-counter" className="font-medium text-white">{index + 1} / {total}</span>
          {photo.name && <span className="ml-2 hidden truncate sm:inline">{photo.name}</span>}
        </div>
        <button type="button" onClick={onClose} className={`${btn} pointer-events-auto`} aria-label="Zamknij podgląd" data-testid="pv-close"><X className="h-5 w-5" /></button>
      </div>

      {/* strzałki */}
      {total > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`} aria-label="Poprzednie zdjęcie" data-testid="pv-prev"><ChevronLeft className="h-6 w-6" /></button>
          <button type="button" onClick={() => go(1)} className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`} aria-label="Następne zdjęcie" data-testid="pv-next"><ChevronRight className="h-6 w-6" /></button>
        </>
      )}

      {/* dolny pasek: powiększenie */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-900/80 p-1.5 ring-1 ring-zinc-800">
          <button type="button" onClick={() => zoomCenter(1 / BUTTON_STEP)} disabled={view.s <= MIN_SCALE} className={btn} aria-label="Pomniejsz" data-testid="pv-out"><Minus className="h-5 w-5" /></button>
          <span className="w-14 text-center text-sm tabular-nums text-zinc-200" data-testid="pv-zoom">{Math.round(view.s * 100)}%</span>
          <button type="button" onClick={() => zoomCenter(BUTTON_STEP)} disabled={view.s >= MAX_SCALE} className={btn} aria-label="Powiększ" data-testid="pv-in"><Plus className="h-5 w-5" /></button>
          <button type="button" onClick={reset} disabled={!zoomed} className={btn} aria-label="Resetuj powiększenie" data-testid="pv-reset"><RotateCcw className="h-5 w-5" /></button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
