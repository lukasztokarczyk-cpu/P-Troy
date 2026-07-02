'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Eraser, Check, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/button';

type SignerRole = 'INSTALLER' | 'MANAGER' | 'INVESTOR' | 'CLIENT';

const SIGNER_ROLE_LABELS: Record<SignerRole, string> = {
  INSTALLER: 'Instalator',
  MANAGER: 'Kierownik',
  INVESTOR: 'Inwestor',
  CLIENT: 'Klient',
};

interface SignaturePadProps {
  signerRole: SignerRole;
  defaultSignerName?: string;
  disabled?: boolean; // true, gdy dokument jest już zablokowany
  onSubmit: (payload: {
    signerRole: SignerRole;
    signerName: string;
    inputMethod: 'MOUSE' | 'TOUCH' | 'STYLUS';
    signatureImageBase64: string;
  }) => Promise<void> | void;
}

/**
 * Podpis jest zapisywany jako PNG w base64 i wysyłany do backendu —
 * sam plik trafia na serwer plików, baza przechowuje tylko ścieżkę
 * (SignaturesService.sign -> FileStorageService.saveBase64Image).
 */
export function SignaturePad({ signerRole, defaultSignerName = '', disabled, onSubmit }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const [hasStroke, setHasStroke] = useState(false);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [inputMethod, setInputMethod] = useState<'MOUSE' | 'TOUCH' | 'STYLUS'>('MOUSE');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#f8fafc';
  }, []);

  const getPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const detectInputMethod = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') setInputMethod('STYLUS');
    else if (e.pointerType === 'touch') setInputMethod('TOUCH');
    else setInputMethod('MOUSE');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    detectInputMethod(e);
    drawing.current = true;
    lastPoint.current = getPoint(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !lastPoint.current) return;

    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    setHasStroke(true);
  };

  const handlePointerUp = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const submit = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke || !signerName.trim()) return;
    setSubmitting(true);
    try {
      const signatureImageBase64 = canvas.toDataURL('image/png');
      await onSubmit({ signerRole, signerName: signerName.trim(), inputMethod, signatureImageBase64 });
    } finally {
      setSubmitting(false);
    }
  };

  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <Check className="h-8 w-8 text-emerald-500" />
        <p className="text-sm text-zinc-300">Dokument został podpisany i zablokowany przed edycją.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-2">
        <PenTool className="h-4 w-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-zinc-200">
          Podpis: {SIGNER_ROLE_LABELS[signerRole]}
        </h3>
      </div>

      <input
        value={signerName}
        onChange={(e) => setSignerName(e.target.value)}
        placeholder="Imię i nazwisko podpisującego"
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none"
      />

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="h-48 w-full touch-none rounded-lg border border-dashed border-zinc-700 bg-zinc-900"
        style={{ cursor: 'crosshair' }}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          Metoda: {inputMethod === 'MOUSE' ? 'mysz' : inputMethod === 'TOUCH' ? 'dotyk' : 'rysik'}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clear} className="border-zinc-700 text-zinc-300">
            <Eraser className="mr-1 h-3.5 w-3.5" /> Wyczyść
          </Button>
          <Button
            size="sm"
            disabled={!hasStroke || !signerName.trim() || submitting}
            onClick={submit}
            className="bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40"
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Zatwierdź podpis
          </Button>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Po zatwierdzeniu zapisany zostanie znacznik czasu, adres IP i informacje o urządzeniu.
        Gdy wszyscy wymagani sygnatariusze złożą podpis, dokument zostanie zablokowany
        przed edycją i wygenerowany zostanie plik PDF.
      </p>
    </div>
  );
}
