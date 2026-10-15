'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { parseNum } from '@/lib/protocols';
import { UNIT_OPTIONS } from '@/lib/orders';
import { inputCls, FieldLabel } from '@/components/protocols/ProtocolInputs';

export interface ItemFormValue { name: string; spec: string; quantity: string; unit: string; note: string }

const CUSTOM = '__custom__';

/** Szybkie dodawanie pozycji: nazwa (dla własnego materiału edytowalna), specyfikacja, ilość, jednostka, uwaga. */
export function ItemForm({
  initial,
  nameEditable,
  specPlaceholder,
  submitLabel = 'Dodaj do zamówienia',
  onSubmit,
  onCancel,
}: {
  initial: Partial<ItemFormValue>;
  nameEditable: boolean;
  specPlaceholder?: string;
  submitLabel?: string;
  onSubmit: (v: ItemFormValue) => void;
  onCancel: () => void;
}) {
  const startUnit = initial.unit ?? 'szt.';
  const [name, setName] = useState(initial.name ?? '');
  const [spec, setSpec] = useState(initial.spec ?? '');
  const [quantity, setQuantity] = useState(initial.quantity ?? '');
  const [unitSel, setUnitSel] = useState(UNIT_OPTIONS.includes(startUnit) ? startUnit : CUSTOM);
  const [unitCustom, setUnitCustom] = useState(UNIT_OPTIONS.includes(startUnit) ? '' : startUnit);
  const [note, setNote] = useState(initial.note ?? '');
  const [err, setErr] = useState('');

  const submit = () => {
    const q = parseNum(quantity);
    const unit = unitSel === CUSTOM ? unitCustom.trim() : unitSel;
    if (!name.trim()) return setErr('Wpisz nazwę materiału.');
    if (q === null || q <= 0) return setErr('Wpisz ilość większą od zera.');
    if (!unit) return setErr('Wpisz jednostkę.');
    setErr('');
    onSubmit({ name: name.trim(), spec: spec.trim(), quantity: String(q), unit, note: note.trim() });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3" data-testid="item-form">
      <div>
        <FieldLabel>Nazwa materiału</FieldLabel>
        {nameEditable ? (
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Kabel YDYp 3x2,5" aria-label="Nazwa materiału" autoFocus />
        ) : (
          <p className="rounded-lg bg-zinc-800/60 px-3 py-2.5 text-sm font-medium text-zinc-100">{name}</p>
        )}
      </div>
      <div>
        <FieldLabel hint="opcjonalnie">Specyfikacja / producent</FieldLabel>
        <input className={inputCls} value={spec} onChange={(e) => setSpec(e.target.value)} placeholder={specPlaceholder || 'np. Legrand, biały, IP44'} aria-label="Specyfikacja" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Ilość</FieldLabel>
          <input className={inputCls} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" aria-label="Ilość" autoFocus={!nameEditable} />
        </div>
        <div>
          <FieldLabel>Jednostka</FieldLabel>
          <select className={inputCls} value={unitSel} onChange={(e) => setUnitSel(e.target.value)} aria-label="Jednostka">
            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            <option value={CUSTOM}>inna…</option>
          </select>
        </div>
      </div>
      {unitSel === CUSTOM && (
        <input className={inputCls} value={unitCustom} onChange={(e) => setUnitCustom(e.target.value)} placeholder="Wpisz jednostkę, np. rolka" aria-label="Własna jednostka" />
      )}
      <div>
        <FieldLabel hint="opcjonalnie">Uwaga</FieldLabel>
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Uwaga" />
      </div>
      {err && <p className="rounded-lg bg-red-950/50 p-2 text-xs text-red-300" role="alert">{err}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel}>Wstecz</Button>
        <Button type="submit" className="h-11 flex-[2]">{submitLabel}</Button>
      </div>
    </form>
  );
}
