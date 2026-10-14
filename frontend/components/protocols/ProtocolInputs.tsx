'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fileToUploadPayload, isBadNumber, type UploadPayload } from '@/lib/protocols';

/** Wspólne, „palcowe” pola protokołu — wysokość min. 44 px, żeby dało się wygodnie wpisywać na telefonie. */
export const inputCls =
  'min-h-[44px] w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none disabled:opacity-60 sm:text-sm';

export const FieldLabel = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <label className="mb-1 block text-xs text-zinc-400">
    {children}
    {hint && <span className="ml-1 text-zinc-600">({hint})</span>}
  </label>
);

interface BaseProps {
  value: any;
  onChange: (v: any) => void;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
}

/**
 * Pole tekstowe z lokalnym stanem — wpisywanie nie wymusza przerysowania całego protokołu
 * (ważne przy tabelach ze 100 wierszami na telefonie). Zmiana trafia do rodzica na bieżąco.
 */
export const TextInput = memo(function TextInput({ value, onChange, disabled, placeholder, multiline, ...rest }: BaseProps & { multiline?: boolean }) {
  const [local, setLocal] = useState<string>(value ?? '');
  const last = useRef(value ?? '');
  useEffect(() => {
    if ((value ?? '') !== last.current) {
      last.current = value ?? '';
      setLocal(value ?? '');
    }
  }, [value]);
  const handle = (v: string) => {
    last.current = v;
    setLocal(v);
    onChange(v);
  };
  if (multiline) {
    return (
      <textarea
        className={cn(inputCls, 'min-h-[88px]')}
        value={local}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        onChange={(e) => handle(e.target.value)}
      />
    );
  }
  return (
    <input
      className={inputCls}
      value={local}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={rest['aria-label']}
      onChange={(e) => handle(e.target.value)}
    />
  );
});

/** Liczba: akceptuje przecinek (klawiatura polska); błędny format jest podświetlony, ale nie blokuje zapisu wersji roboczej. */
export const NumberInput = memo(function NumberInput({ value, onChange, disabled, placeholder, unit, ...rest }: BaseProps & { unit?: string }) {
  const [local, setLocal] = useState<string>(value === null || value === undefined ? '' : String(value));
  const last = useRef(local);
  useEffect(() => {
    const v = value === null || value === undefined ? '' : String(value);
    if (v !== last.current) {
      last.current = v;
      setLocal(v);
    }
  }, [value]);
  const bad = isBadNumber(local);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        className={cn(inputCls, unit && 'pr-10', bad && 'border-red-600 focus:border-red-500')}
        value={local}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        aria-invalid={bad}
        onChange={(e) => {
          last.current = e.target.value;
          setLocal(e.target.value);
          onChange(e.target.value);
        }}
      />
      {unit && <span className="pointer-events-none absolute right-3 top-[22px] -translate-y-1/2 text-xs text-zinc-500">{unit}</span>}
      {bad && <p className="mt-0.5 text-[11px] text-red-400">Błędny format liczby</p>}
    </div>
  );
});

export const DateInput = memo(function DateInput({ value, onChange, disabled, ...rest }: BaseProps) {
  return (
    <input
      type="date"
      className={inputCls}
      value={value ? String(value).slice(0, 10) : ''}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => onChange(e.target.value)}
    />
  );
});

export const SelectInput = memo(function SelectInput({ value, onChange, disabled, options, placeholder = '—', ...rest }: BaseProps & { options: string[] }) {
  return (
    <select className={inputCls} value={value ?? ''} disabled={disabled} aria-label={rest['aria-label']} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
});

const RATING_STYLE: Record<string, string> = {
  OK: 'bg-emerald-600 text-white',
  NIE: 'bg-red-600 text-white',
  ND: 'bg-zinc-600 text-white',
  'N/D': 'bg-zinc-600 text-white',
};

/** Przyciski OK / NIE / N/D — jedno dotknięcie, ponowne dotknięcie czyści wybór. */
export const Segmented = memo(function Segmented({
  value,
  onChange,
  disabled,
  options = ['OK', 'NIE', 'N/D'],
  ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  options?: string[];
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? null : o)}
            className={cn(
              'min-h-[44px] min-w-[52px] border-r border-zinc-700 px-3 text-sm font-medium last:border-r-0 disabled:opacity-60',
              active ? RATING_STYLE[o] ?? 'bg-orange-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800',
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
});

export const Toggle = memo(function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm disabled:opacity-60',
        checked ? 'border-orange-600 bg-orange-950/30 text-orange-200' : 'border-zinc-700 bg-zinc-950 text-zinc-300',
      )}
    >
      <span>{label}</span>
      <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-orange-600' : 'bg-zinc-700')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
});

/** Przycisk „Zrób zdjęcie” — na telefonie otwiera aparat (capture="environment"), na komputerze wybór pliku. */
export function PhotoButton({
  label,
  disabled,
  onFile,
  accept = 'image/*',
  capture = true,
}: {
  label: string;
  disabled?: boolean;
  onFile: (p: UploadPayload) => Promise<void> | void;
  accept?: string;
  capture?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        {...(capture ? { capture: 'environment' as const } : {})}
        className="hidden"
        data-testid="photo-input"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            await onFile(await fileToUploadPayload(f));
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => ref.current?.click()}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {label}
      </button>
    </>
  );
}
