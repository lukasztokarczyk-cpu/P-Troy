'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { ScanLine, Package, CheckCircle2, XCircle, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ScanOperation =
  | 'ISSUE'
  | 'RETURN'
  | 'TRANSFER'
  | 'ASSIGN_VEHICLE'
  | 'ASSIGN_SITE'
  | 'ASSIGN_INSTALLER'
  | 'LOOKUP';

interface ScannedProduct {
  id: string;
  value: string;
  product?: {
    name: string;
    catalogNumber: string;
    manufacturer: string;
    photoPath?: string;
    stockLevels: { warehouseId: string; quantity: number }[];
  };
}

interface BarcodeScannerProps {
  onLookup: (value: string) => Promise<ScannedProduct | null>;
  onOperation: (value: string, operation: ScanOperation, quantity: number) => Promise<void>;
}

/**
 * Skaner pozostaje aktywny cały czas (decodeFromVideoDevice w pętli
 * ciągłej z ZXing) — po odczycie kodu pokazujemy panel z danymi produktu
 * NAD podglądem kamery zamiast go zamykać, więc pracownik może od razu
 * zeskanować kolejny produkt. Ostatnio odczytana wartość jest
 * krótkotrwale "cooldownowana", żeby uniknąć wielokrotnych odczytów
 * tego samego kodu w ułamku sekundy.
 */
export function BarcodeScanner({ onLookup, onOperation }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  const [scanned, setScanned] = useState<ScannedProduct | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'error'>('idle');
  const [quantity, setQuantity] = useState(1);

  const handleDetected = useCallback(
    async (value: string) => {
      const now = Date.now();
      if (lastScanRef.current?.value === value && now - lastScanRef.current.at < 2500) {
        return; // cooldown — ten sam kod nie jest przetwarzany ponownie od razu
      }
      lastScanRef.current = { value, at: now };

      const result = await onLookup(value);
      setScanned(result);
    },
    [onLookup],
  );

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setStatus('scanning');

    reader
      .decodeFromVideoDevice(null, videoRef.current!, (result, err) => {
        if (result) {
          handleDetected(result.getText());
        } else if (err && !(err instanceof NotFoundException)) {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));

    return () => {
      reader.reset();
    };
  }, [handleDetected]);

  const runOperation = async (operation: ScanOperation) => {
    if (!scanned) return;
    await onOperation(scanned.value, operation, quantity);
    setScanned(null); // wraca do trybu skanowania, gotowy na kolejny kod
    setQuantity(1);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-2">
        <ScanLine className="h-4 w-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-zinc-200">Skaner kodów QR / kreskowych</h3>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
            status === 'scanning' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
          }`}
        >
          {status === 'scanning' ? 'Aktywny' : 'Błąd kamery'}
        </span>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-800 bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {/* Ramka celownicza — czysto wizualna, nie wpływa na detekcję */}
        <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-orange-500/70" />
      </div>

      {scanned && (
        <div className="rounded-lg border border-orange-600/40 bg-zinc-900 p-3">
          {scanned.product ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <Package className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium text-zinc-100">{scanned.product.name}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                <dt>Nr katalogowy</dt>
                <dd className="text-right text-zinc-200">{scanned.product.catalogNumber}</dd>
                <dt>Producent</dt>
                <dd className="text-right text-zinc-200">{scanned.product.manufacturer}</dd>
                <dt>Stan łączny</dt>
                <dd className="text-right text-zinc-200">
                  {scanned.product.stockLevels.reduce((s, l) => s + l.quantity, 0)}
                </dd>
              </dl>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                />
                <Button size="sm" onClick={() => runOperation('ISSUE')} className="bg-orange-600 text-white hover:bg-orange-500">
                  Pobierz
                </Button>
                <Button size="sm" variant="outline" onClick={() => runOperation('RETURN')} className="border-zinc-700 text-zinc-300">
                  Zwróć
                </Button>
                <Button size="sm" variant="outline" onClick={() => runOperation('TRANSFER')} className="border-zinc-700 text-zinc-300">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <XCircle className="h-4 w-4" /> Nieznany kod — brak produktu w systemie
            </div>
          )}

          <button
            onClick={() => setScanned(null)}
            className="mt-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Kontynuuj skanowanie
          </button>
        </div>
      )}
    </div>
  );
}
