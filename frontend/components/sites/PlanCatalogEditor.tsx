'use client';

import { useState } from 'react';
import { Loader2, Eye, EyeOff, Trash2, Plus, RotateCcw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Modal, fieldClass } from '@/components/ui/modal';
import { PLAN_KINDS, kindOf, type CatalogKind, type CatalogSubtype } from '@/lib/plan-catalog';

/**
 * Okno administratora: nazwy w paletach planera. Można zmienić nazwę każdego typu,
 * ukryć typ w palecie, dodać własny typ (np. „Włącznik” w Oświetleniu) z prefiksem
 * numeracji i usunąć własny typ, który nie jest jeszcze użyty na żadnym rzucie.
 */
export function PlanCatalogEditor({ open, catalog, onClose, onChanged }: {
  open: boolean;
  catalog: CatalogKind[];     // katalog z ukrytymi typami (includeArchived)
  onClose: () => void;
  onChanged: () => void;      // odśwież katalog w planerze
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, { label: string; prefix: string }>>({});

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try { await fn(); onChanged(); } catch (err: any) { setError(err.message || 'Nie udało się zapisać zmiany.'); } finally { setBusy(null); }
  };

  const saveLabel = (kind: string, s: CatalogSubtype, label: string) => {
    const next = label.trim();
    if (next === s.label || (!next && !s.custom && s.label === s.builtinLabel)) return;
    if (!next && s.custom) { setError('Nazwa typu nie może być pusta.'); onChanged(); return; }
    return run(s.key, () => s.custom
      ? apiClient(`/api/plan-catalog/types/${s.id}`, { method: 'PATCH', body: { label: next } })
      : apiClient(`/api/plan-catalog/builtin/${kind}/${s.key}`, { method: 'PATCH', body: { label: next } }));
  };

  const toggleArchived = (kind: string, s: CatalogSubtype) =>
    run(s.key, () => s.custom
      ? apiClient(`/api/plan-catalog/types/${s.id}`, { method: 'PATCH', body: { isArchived: !s.archived } })
      : apiClient(`/api/plan-catalog/builtin/${kind}/${s.key}`, { method: 'PATCH', body: { isArchived: !s.archived } }));

  const resetLabel = (kind: string, s: CatalogSubtype) =>
    run(s.key, () => apiClient(`/api/plan-catalog/builtin/${kind}/${s.key}`, { method: 'PATCH', body: { label: '' } }));

  const remove = (s: CatalogSubtype) => {
    if (!window.confirm(`Usunąć typ „${s.label}”?`)) return;
    return run(s.key, () => apiClient(`/api/plan-catalog/types/${s.id}`, { method: 'DELETE' }));
  };

  const add = (kind: string) => {
    const f = adding[kind];
    if (!f?.label.trim() || !f.prefix.trim()) { setError('Podaj nazwę i prefiks numeracji (np. WL).'); return; }
    return run(`add-${kind}`, async () => {
      await apiClient('/api/plan-catalog/types', { method: 'POST', body: { kind, label: f.label, prefix: f.prefix.toUpperCase() } });
      setAdding((a) => ({ ...a, [kind]: { label: '', prefix: '' } }));
    });
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl" title="Nazwy w paletach planera" description="Zmień nazwy typów, ukryj te, których nie używasz, albo dodaj własne (np. „Włącznik” w Oświetleniu).">
      <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
        {error && <p className="rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{error}</p>}
        {PLAN_KINDS.map((pk) => {
          const kind = catalog.find((k) => k.key === pk.key);
          if (!kind) return null;
          const meta = kindOf(pk.key)!;
          const a = adding[pk.key] ?? { label: '', prefix: '' };
          return (
            <section key={pk.key}>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} /> {kind.label}
              </p>
              <ul className="space-y-1">
                {kind.subtypes.map((s) => (
                  <li key={s.key} className={`flex items-center gap-2 ${s.archived ? 'opacity-50' : ''}`}>
                    <input
                      defaultValue={s.label}
                      key={`${s.key}-${s.label}`}
                      disabled={busy === s.key}
                      onBlur={(e) => saveLabel(pk.key, s, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      maxLength={60}
                      className={fieldClass}
                      aria-label={`Nazwa typu ${s.label}`}
                    />
                    <span className="w-14 shrink-0 text-center text-[11px] text-zinc-500" title="Prefiks numeracji">{s.prefix}</span>
                    {!s.custom && s.label !== s.builtinLabel && (
                      <button onClick={() => resetLabel(pk.key, s)} className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title={`Przywróć nazwę: ${s.builtinLabel}`}><RotateCcw className="h-3.5 w-3.5" /></button>
                    )}
                    <button onClick={() => toggleArchived(pk.key, s)} className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title={s.archived ? 'Pokaż w palecie' : 'Ukryj w palecie'}>
                      {s.archived ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    {s.custom ? (
                      <button onClick={() => remove(s)} className="shrink-0 rounded p-1 text-zinc-500 hover:bg-red-950 hover:text-red-400" title="Usuń typ (tylko gdy nie jest użyty)"><Trash2 className="h-3.5 w-3.5" /></button>
                    ) : <span className="w-6 shrink-0" />}
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex items-center gap-2">
                <input value={a.label} onChange={(e) => setAdding((x) => ({ ...x, [pk.key]: { ...a, label: e.target.value } }))} placeholder="Nowy typ, np. Włącznik" maxLength={60} className={fieldClass} />
                <input value={a.prefix} onChange={(e) => setAdding((x) => ({ ...x, [pk.key]: { ...a, prefix: e.target.value.toUpperCase() } }))} placeholder="Prefiks" maxLength={6} className={`${fieldClass} !w-24 shrink-0`} title="Prefiks numeracji, np. WL daje WL.1, WL.2" />
                <button onClick={() => add(pk.key)} disabled={busy === `add-${pk.key}`} className="flex shrink-0 items-center gap-1 rounded-lg border border-orange-600/40 px-2.5 py-2 text-xs text-orange-300 hover:bg-orange-500/10 disabled:opacity-50">
                  {busy === `add-${pk.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Dodaj
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-zinc-600">Prefiks decyduje o numeracji punktów (WL.1, WL.2…). Prefiksu typu użytego na rzutach nie da się już zmienić, ale nazwę tak.</p>
    </Modal>
  );
}
