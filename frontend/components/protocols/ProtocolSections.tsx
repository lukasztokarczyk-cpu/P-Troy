'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Download, Wrench, X, Image as ImageIcon, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type AttachmentItem,
  type CalcConfig,
  type ColumnDef,
  type CustomFieldDef,
  type FieldDef,
  type ProtocolSchema,
  type SectionDef,
  type UploadPayload,
  emptyRow,
  loopCalc,
  newRowId,
  suggestRating,
} from '@/lib/protocols';
import { DateInput, FieldLabel, NumberInput, PhotoButton, Segmented, SelectInput, TextInput, Toggle, inputCls } from './ProtocolInputs';

type Data = Record<string, any>;
type Row = Record<string, any>;

export interface SectionCtx {
  schema: ProtocolSchema;
  data: Data;
  /** Zmiana całej treści protokołu — zawsze funkcyjnie, żeby szybkie wpisywanie nie gubiło zmian. */
  setData: (fn: (d: Data) => Data) => void;
  readOnly: boolean;
  calc: CalcConfig | null;
  isAdmin: boolean;
  attachments: AttachmentItem[];
  uploadAttachment: (p: UploadPayload, fieldKey: string, kind?: string) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
  onPickInstrument?: () => void;
  onImportBoard?: (sectionKey: string) => void;
  canImportBoard?: boolean;
  onOpenCalcConfig?: () => void;
}

// ---------------------------------------------------------------------------
// Telefon vs komputer: tabele na komputerze, karty na telefonie
// ---------------------------------------------------------------------------

export function useIsMobile(query = '(max-width: 767px)'): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [m, setM] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    h();
    if (mq.addEventListener) mq.addEventListener('change', h);
    else mq.addListener?.(h);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', h);
      else mq.removeListener?.(h);
    };
  }, [query]);
  return m;
}

// ---------------------------------------------------------------------------
// Komórka (jedno pole kolumny)
// ---------------------------------------------------------------------------

const Cell = memo(function Cell({ col, value, onChange, disabled }: { col: ColumnDef; value: any; onChange: (v: any) => void; disabled: boolean }) {
  switch (col.type) {
    case 'number':
      return <NumberInput value={value} onChange={onChange} disabled={disabled} unit={col.unit} aria-label={col.label} />;
    case 'date':
      return <DateInput value={value} onChange={onChange} disabled={disabled} aria-label={col.label} />;
    case 'select':
      return <SelectInput value={value} onChange={onChange} disabled={disabled} options={col.options ?? []} aria-label={col.label} />;
    case 'rating':
      return <Segmented value={value} onChange={onChange} disabled={disabled} options={col.options ?? ['OK', 'NIE', 'N/D']} ariaLabel={col.label} />;
    default:
      return <TextInput value={value} onChange={onChange} disabled={disabled} aria-label={col.label} />;
  }
});

const ComputedCell = ({ value, unit }: { value: any; unit?: string }) => (
  <div className="flex min-h-[44px] items-center rounded-lg bg-zinc-900 px-3 text-sm text-zinc-300" data-computed>
    {value === null || value === undefined || value === '' ? <span className="text-zinc-600">—</span> : `${value}${unit ? ' ' + unit : ''}`}
  </div>
);

// ---------------------------------------------------------------------------
// Edytor wierszy (tabele)
// ---------------------------------------------------------------------------

interface RowPhotoSlot { suffix: string; label: string }

interface RowsEditorProps {
  sectionKey: string;
  columns: ColumnDef[];
  rows: Row[];
  onRows: (fn: (rows: Row[]) => Row[]) => void;
  readOnly: boolean;
  addLabel?: string;
  /** Wartości wyliczane (np. Ia) — nadpisują zapisane. */
  computeRow?: (row: Row) => Record<string, any>;
  photoSlots?: RowPhotoSlot[];
  attachments?: AttachmentItem[];
  onUpload?: (p: UploadPayload, fieldKey: string) => Promise<void>;
  onRemoveAttachment?: (id: string) => Promise<void>;
  /** Podpowiedź oceny pod wierszem (nigdy nie ustawia oceny automatycznie). */
  hintFor?: (row: Row) => string | null;
  extraActions?: React.ReactNode;
  emptyText?: string;
}

function RowPhotos({ rowId, sectionKey, slots, attachments, readOnly, onUpload, onRemove }: {
  rowId: string; sectionKey: string; slots: RowPhotoSlot[]; attachments: AttachmentItem[]; readOnly: boolean;
  onUpload?: (p: UploadPayload, fieldKey: string) => Promise<void>; onRemove?: (id: string) => Promise<void>;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {slots.map((s) => {
        const key = `${sectionKey}:${rowId}:${s.suffix}`;
        const list = attachments.filter((a) => a.fieldKey === key);
        return (
          <div key={s.suffix} className="min-w-[140px]">
            <p className="mb-1 text-[11px] text-zinc-500">{s.label}</p>
            <div className="flex flex-wrap items-center gap-2">
              {list.map((a) => (
                <div key={a.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbnailUrl || a.url} alt={s.label} className="h-16 w-16 rounded-lg border border-zinc-700 object-cover" />
                  {!readOnly && onRemove && (
                    <button type="button" aria-label="Usuń zdjęcie" onClick={() => onRemove(a.id)} className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && onUpload && <PhotoButton label={list.length ? 'Dodaj kolejne' : 'Zrób zdjęcie'} onFile={(p) => onUpload(p, key)} />}
              {readOnly && list.length === 0 && <span className="text-xs text-zinc-600">brak</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RowsEditor(props: RowsEditorProps) {
  const { sectionKey, columns, rows, onRows, readOnly, addLabel = 'Dodaj wiersz', computeRow, photoSlots, attachments = [], hintFor } = props;
  const mobile = useIsMobile();

  const onCell = useCallback(
    (rowId: string, key: string, value: any) => onRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, [key]: value } : r))),
    [onRows],
  );
  const onRemove = useCallback((rowId: string) => onRows((rs) => rs.filter((r) => r.id !== rowId)), [onRows]);
  const add = () => onRows((rs) => [...rs, emptyRow(columns)]);
  const duplicate = (rowId: string) =>
    onRows((rs) => {
      const i = rs.findIndex((r) => r.id === rowId);
      if (i < 0) return rs;
      const copy: Row = { ...rs[i], id: newRowId() };
      for (const c of columns) if (c.isResult) copy[c.key] = c.type === 'rating' ? null : '';
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
    });

  const primary = columns.find((c) => c.primary) ?? columns[0];

  return (
    <div>
      {rows.length === 0 && <p className="mb-3 text-sm text-zinc-500">{props.emptyText ?? 'Brak pozycji.'}</p>}

      {mobile ? (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <RowCard
              key={row.id}
              idx={idx}
              row={row}
              columns={columns}
              primaryKey={primary?.key}
              computed={computeRow?.(row)}
              hint={hintFor?.(row) ?? null}
              readOnly={readOnly}
              onCell={onCell}
              onRemove={onRemove}
              onDuplicate={duplicate}
              sectionKey={sectionKey}
              photoSlots={photoSlots}
              attachments={attachments}
              onUpload={props.onUpload}
              onRemoveAttachment={props.onRemoveAttachment}
            />
          ))}
        </div>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
              <tr>
                <th className="w-8 px-2 py-2">#</th>
                {columns.map((c) => (
                  <th key={c.key} className="px-2 py-2 font-medium" style={{ minWidth: Math.max(90, (c.w ?? 1) * 110) }}>
                    {c.label}
                    {c.unit ? <span className="ml-1 text-zinc-600">[{c.unit}]</span> : null}
                  </th>
                ))}
                {!readOnly && <th className="w-24 px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <RowTr
                  key={row.id}
                  idx={idx}
                  row={row}
                  columns={columns}
                  computed={computeRow?.(row)}
                  hint={hintFor?.(row) ?? null}
                  readOnly={readOnly}
                  onCell={onCell}
                  onRemove={onRemove}
                  onDuplicate={duplicate}
                  sectionKey={sectionKey}
                  photoSlots={photoSlots}
                  attachments={attachments}
                  onUpload={props.onUpload}
                  onRemoveAttachment={props.onRemoveAttachment}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={add} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-500">
            <Plus className="h-4 w-4" /> {addLabel}
          </button>
          {props.extraActions}
        </div>
      )}
    </div>
  );
}

interface RowViewProps {
  idx: number;
  row: Row;
  columns: ColumnDef[];
  computed?: Record<string, any>;
  hint: string | null;
  readOnly: boolean;
  onCell: (rowId: string, key: string, value: any) => void;
  onRemove: (rowId: string) => void;
  onDuplicate: (rowId: string) => void;
  sectionKey: string;
  photoSlots?: RowPhotoSlot[];
  attachments: AttachmentItem[];
  onUpload?: (p: UploadPayload, fieldKey: string) => Promise<void>;
  onRemoveAttachment?: (id: string) => Promise<void>;
}

const RowCard = memo(function RowCard(p: RowViewProps & { primaryKey?: string }) {
  const { row, columns, computed, readOnly } = p;
  const title = (p.primaryKey && row[p.primaryKey]) || `Pozycja ${p.idx + 1}`;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3" data-testid="row-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-zinc-100">
          <span className="mr-2 text-zinc-500">{p.idx + 1}.</span>
          {String(title)}
        </p>
        {!readOnly && (
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-label="Powiel wiersz" onClick={() => p.onDuplicate(row.id)} className="rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
              Powiel
            </button>
            <button type="button" aria-label="Usuń wiersz" onClick={() => p.onRemove(row.id)} className="rounded-lg p-2 text-red-400 hover:bg-zinc-800">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columns.map((c) => (
          <div key={c.key} className={cn(c.type === 'rating' && 'sm:col-span-2')}>
            <FieldLabel hint={c.unit}>{c.label}</FieldLabel>
            {c.computed ? (
              <ComputedCell value={computed?.[c.key] ?? row[c.key]} unit={c.unit} />
            ) : (
              <Cell col={c} value={row[c.key]} disabled={readOnly} onChange={(v) => p.onCell(row.id, c.key, v)} />
            )}
          </div>
        ))}
      </div>
      {p.hint && <p className="mt-2 text-xs text-amber-300">{p.hint}</p>}
      {p.photoSlots && <RowPhotos rowId={row.id} sectionKey={p.sectionKey} slots={p.photoSlots} attachments={p.attachments} readOnly={readOnly} onUpload={p.onUpload} onRemove={p.onRemoveAttachment} />}
    </div>
  );
});

const RowTr = memo(function RowTr(p: RowViewProps) {
  const { row, columns, computed, readOnly } = p;
  return (
    <>
      <tr className="border-t border-zinc-800 align-top" data-testid="row-tr">
        <td className="px-2 py-2 text-xs text-zinc-500">{p.idx + 1}</td>
        {columns.map((c) => (
          <td key={c.key} className="px-1 py-1.5">
            {c.computed ? (
              <ComputedCell value={computed?.[c.key] ?? row[c.key]} unit={undefined} />
            ) : (
              <Cell col={c} value={row[c.key]} disabled={readOnly} onChange={(v) => p.onCell(row.id, c.key, v)} />
            )}
          </td>
        ))}
        {!readOnly && (
          <td className="px-1 py-1.5 text-right">
            <button type="button" aria-label="Powiel wiersz" onClick={() => p.onDuplicate(row.id)} className="rounded-lg px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
              Powiel
            </button>
            <button type="button" aria-label="Usuń wiersz" onClick={() => p.onRemove(row.id)} className="rounded-lg p-2 text-red-400 hover:bg-zinc-800">
              <Trash2 className="h-4 w-4" />
            </button>
          </td>
        )}
      </tr>
      {(p.hint || p.photoSlots) && (
        <tr>
          <td />
          <td colSpan={columns.length + 1} className="px-2 pb-2">
            {p.hint && <p className="text-xs text-amber-300">{p.hint}</p>}
            {p.photoSlots && <RowPhotos rowId={row.id} sectionKey={p.sectionKey} slots={p.photoSlots} attachments={p.attachments} readOnly={readOnly} onUpload={p.onUpload} onRemove={p.onRemoveAttachment} />}
          </td>
        </tr>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Pola formularza (sekcje typu „fields”) i pola własne
// ---------------------------------------------------------------------------

function FieldInput({ f, value, onChange, disabled }: { f: FieldDef; value: any; onChange: (v: any) => void; disabled: boolean }) {
  switch (f.type) {
    case 'textarea':
      return <TextInput multiline value={value} onChange={onChange} disabled={disabled} aria-label={f.label} />;
    case 'number':
      return <NumberInput value={value} onChange={onChange} disabled={disabled} unit={f.unit} aria-label={f.label} />;
    case 'date':
      return <DateInput value={value} onChange={onChange} disabled={disabled} aria-label={f.label} />;
    case 'select':
      return <SelectInput value={value} onChange={onChange} disabled={disabled} options={f.options ?? []} aria-label={f.label} />;
    case 'checkbox':
      return <Toggle checked={!!value} onChange={onChange} disabled={disabled} label={f.label} />;
    default:
      return <TextInput value={value} onChange={onChange} disabled={disabled} aria-label={f.label} />;
  }
}

function tableColumnsOf(cf: CustomFieldDef): ColumnDef[] {
  const raw = Array.isArray(cf.options) ? cf.options : [];
  return raw.map((c: any) => ({ key: c.key, label: c.label, type: (c.type as ColumnDef['type']) || 'text', unit: c.unit }));
}

/** Pola własne dodane przez administratora do sekcji (poza tabelami — te mają własny blok). */
function CustomFields({ sectionKey, ctx }: { sectionKey: string; ctx: SectionCtx }) {
  const fields = ctx.schema.customFields.filter((f) => f.sectionKey === sectionKey && f.isActive !== false);
  if (fields.length === 0) return null;
  const block = ctx.data.custom?.[sectionKey] ?? {};
  const set = (key: string, v: any) =>
    ctx.setData((d) => ({ ...d, custom: { ...(d.custom ?? {}), [sectionKey]: { ...(d.custom?.[sectionKey] ?? {}), [key]: v } } }));
  return (
    <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4" data-testid="custom-fields">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Pola dodatkowe</p>
      {fields.map((cf) => {
        const label = cf.label + (cf.required ? ' *' : '');
        const value = block[cf.key];
        if (cf.type === 'table') {
          return (
            <div key={cf.id}>
              <FieldLabel>{label}</FieldLabel>
              <RowsEditor
                sectionKey={`cf-${cf.key}`}
                columns={tableColumnsOf(cf)}
                rows={Array.isArray(value) ? value : []}
                readOnly={ctx.readOnly}
                onRows={(fn) => ctx.setData((d) => ({ ...d, custom: { ...(d.custom ?? {}), [sectionKey]: { ...(d.custom?.[sectionKey] ?? {}), [cf.key]: fn(Array.isArray(d.custom?.[sectionKey]?.[cf.key]) ? d.custom[sectionKey][cf.key] : []) } } }))}
              />
            </div>
          );
        }
        if (cf.type === 'photo' || cf.type === 'attachment') {
          const key = `custom:${sectionKey}:${cf.key}`;
          const list = ctx.attachments.filter((a) => a.fieldKey === key);
          return (
            <div key={cf.id}>
              <FieldLabel hint={cf.hint ?? undefined}>{label}</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                {list.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                    <ImageIcon className="h-3 w-3" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="underline">{a.fileName}</a>
                    {!ctx.readOnly && (
                      <button type="button" aria-label="Usuń plik" onClick={() => ctx.removeAttachment(a.id)} className="text-red-400"><X className="h-3 w-3" /></button>
                    )}
                  </div>
                ))}
                {!ctx.readOnly && (
                  <PhotoButton
                    label={cf.type === 'photo' ? 'Zrób zdjęcie' : 'Dodaj plik'}
                    capture={cf.type === 'photo'}
                    accept={cf.type === 'photo' ? 'image/*' : 'image/*,application/pdf'}
                    onFile={(p) => ctx.uploadAttachment(p, key, cf.type === 'photo' ? 'PHOTO' : 'ATTACHMENT')}
                  />
                )}
              </div>
            </div>
          );
        }
        const fd: FieldDef = {
          key: cf.key,
          label,
          type: cf.type === 'list' ? 'select' : cf.type === 'checkbox' ? 'checkbox' : (cf.type as any),
          options: cf.type === 'list' ? (Array.isArray(cf.options) ? cf.options.map(String) : []) : undefined,
          unit: cf.unit ?? undefined,
        };
        return (
          <div key={cf.id}>
            {cf.type !== 'checkbox' && <FieldLabel hint={cf.hint ?? undefined}>{label}</FieldLabel>}
            <FieldInput f={fd} value={value} disabled={ctx.readOnly} onChange={(v) => set(cf.key, v)} />
          </div>
        );
      })}
    </div>
  );
}

function FieldsSection({ def, ctx }: { def: SectionDef; ctx: SectionCtx }) {
  const block = def.isCustom ? ctx.data.custom?.[def.key] ?? {} : ctx.data[def.key] ?? {};
  const set = (key: string, v: any) =>
    ctx.setData((d) =>
      def.isCustom
        ? { ...d, custom: { ...(d.custom ?? {}), [def.key]: { ...(d.custom?.[def.key] ?? {}), [key]: v } } }
        : { ...d, [def.key]: { ...(d[def.key] ?? {}), [key]: v } },
    );
  const fields = def.fields ?? [];
  return (
    <div>
      {fields.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            if (f.key === 'netSystemOther' && block.netSystem !== 'Inny') return null;
            return (
              <div key={f.key} className={cn(f.type === 'textarea' && 'sm:col-span-2')}>
                {f.type !== 'checkbox' && <FieldLabel hint={f.unit}>{f.label}</FieldLabel>}
                <FieldInput f={f} value={block[f.key]} disabled={ctx.readOnly} onChange={(v) => set(f.key, v)} />
              </div>
            );
          })}
        </div>
      )}
      {!def.isCustom && <CustomFields sectionKey={def.key} ctx={ctx} />}
      {def.isCustom && <CustomFields sectionKey={def.key} ctx={ctx} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabele
// ---------------------------------------------------------------------------

const BOARD_SECTIONS = new Set(['continuity', 'insulation', 'loop', 'rcd']);

function TableSection({ def, ctx }: { def: SectionDef; ctx: SectionCtx }) {
  const columns = def.columns ?? [];
  const rows: Row[] = def.isCustom
    ? ctx.data.custom?.[def.key]?.rows ?? []
    : Array.isArray(ctx.data[def.key])
      ? ctx.data[def.key]
      : [];

  const onRows = useCallback(
    (fn: (r: Row[]) => Row[]) =>
      ctx.setData((d) => {
        if (def.isCustom) {
          const cur = d.custom?.[def.key]?.rows ?? [];
          return { ...d, custom: { ...(d.custom ?? {}), [def.key]: { ...(d.custom?.[def.key] ?? {}), rows: fn(cur) } } };
        }
        return { ...d, [def.key]: fn(Array.isArray(d[def.key]) ? d[def.key] : []) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.setData, def.key, def.isCustom],
  );

  const isLoop = def.key === 'loop';
  const computeRow = useMemo(() => (isLoop ? (row: Row) => {
    const c = loopCalc(row, ctx.calc);
    return { ia: c.ia, zsRequired: c.zsRequired };
  } : undefined), [isLoop, ctx.calc]);

  const hintFor = useMemo(() => (isLoop ? (row: Row) => {
    const c = loopCalc(row, ctx.calc);
    const s = suggestRating(row.zs, c.zsRequired);
    if (!s || row.rating === s) return null;
    return `Podpowiedź (nie ustawia oceny automatycznie): Zs ${row.zs} Ω ${s === 'OK' ? '≤' : '>'} ${c.zsRequired} Ω → sugerowana ocena: ${s}.`;
  } : undefined), [isLoop, ctx.calc]);

  const photoSlots: RowPhotoSlot[] | undefined =
    def.key === 'defects'
      ? [{ suffix: 'before', label: 'Zdjęcie przed' }, { suffix: 'after', label: 'Zdjęcie po usunięciu' }]
      : def.key === 'instruments'
        ? [{ suffix: 'certificate', label: 'Świadectwo wzorcowania (skan/zdjęcie)' }]
        : undefined;

  const upload = useCallback((p: UploadPayload, fieldKey: string) => ctx.uploadAttachment(p, fieldKey), [ctx]);

  return (
    <div>
      {isLoop && !ctx.calc?.u0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200" data-testid="calc-notice">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Kolumny „Ia” i „Wymagane Zs” liczą się wyłącznie ze współczynników wpisanych przez administratora (Ustawienia protokołów).
            Dopóki ich nie ma, pozostają puste — ocenę wpisujesz samodzielnie.
            {ctx.isAdmin && ctx.onOpenCalcConfig && (
              <button type="button" onClick={ctx.onOpenCalcConfig} className="ml-2 underline">Ustaw teraz</button>
            )}
          </p>
        </div>
      )}
      <RowsEditor
        sectionKey={def.key}
        columns={columns}
        rows={rows}
        onRows={onRows}
        readOnly={ctx.readOnly}
        addLabel={def.addLabel}
        computeRow={computeRow}
        hintFor={hintFor}
        photoSlots={photoSlots}
        attachments={ctx.attachments}
        onUpload={upload}
        onRemoveAttachment={ctx.removeAttachment}
        emptyText="Brak pozycji — dodaj pierwszą."
        extraActions={
          <>
            {def.key === 'instruments' && ctx.onPickInstrument && (
              <button type="button" onClick={ctx.onPickInstrument} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:bg-zinc-800">
                <Wrench className="h-4 w-4" /> Wybierz ze Sprzętu
              </button>
            )}
            {BOARD_SECTIONS.has(def.key) && ctx.canImportBoard && ctx.onImportBoard && (
              <button type="button" onClick={() => ctx.onImportBoard!(def.key)} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:bg-zinc-800">
                <Download className="h-4 w-4" /> Importuj z rozdzielni
              </button>
            )}
          </>
        }
      />
      {!def.isCustom && <CustomFields sectionKey={def.key} ctx={ctx} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listy kontrolne (oględziny, połączenia wyrównawcze, odgromowa)
// ---------------------------------------------------------------------------

interface CheckItem { key: string; label: string; state: string | null; note?: string; custom?: boolean }

function Checklist({ items, onItems, readOnly, addLabel }: { items: CheckItem[]; onItems: (fn: (i: CheckItem[]) => CheckItem[]) => void; readOnly: boolean; addLabel?: string }) {
  const [newLabel, setNewLabel] = useState('');
  const setItem = (key: string, patch: Partial<CheckItem>) => onItems((is) => is.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  return (
    <div>
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {items.map((it) => (
          <li key={it.key} className="p-3" data-testid="check-item">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-zinc-200">{it.label}</span>
              <div className="flex items-center gap-2">
                <Segmented
                  ariaLabel={it.label}
                  value={it.state === 'ND' ? 'N/D' : it.state}
                  disabled={readOnly}
                  onChange={(v) => setItem(it.key, { state: v === 'N/D' ? 'ND' : v })}
                />
                {it.custom && !readOnly && (
                  <button type="button" aria-label="Usuń punkt" onClick={() => onItems((is) => is.filter((i) => i.key !== it.key))} className="rounded-lg p-2 text-red-400 hover:bg-zinc-800">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {(it.state === 'NIE' || it.note) && (
              <div className="mt-2">
                <TextInput value={it.note ?? ''} onChange={(v) => setItem(it.key, { note: v })} disabled={readOnly} placeholder="Uwaga (np. co jest nie tak)" aria-label={`Uwaga: ${it.label}`} />
              </div>
            )}
            {it.state !== 'NIE' && !it.note && !readOnly && (
              <button type="button" className="mt-1 text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setItem(it.key, { note: ' ' })}>+ uwaga</button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className={cn(inputCls, 'max-w-sm')}
            value={newLabel}
            placeholder={addLabel ?? 'Dodaj własny punkt'}
            aria-label="Nazwa własnego punktu"
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button
            type="button"
            disabled={!newLabel.trim()}
            onClick={() => {
              onItems((is) => [...is, { key: `c${newRowId()}`, label: newLabel.trim(), state: null, note: '', custom: true }]);
              setNewLabel('');
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Dodaj
          </button>
        </div>
      )}
    </div>
  );
}

function ChecklistSection({ def, ctx }: { def: SectionDef; ctx: SectionCtx }) {
  const items: CheckItem[] = ctx.data[def.key]?.items ?? [];
  const onItems = useCallback(
    (fn: (i: CheckItem[]) => CheckItem[]) => ctx.setData((d) => ({ ...d, [def.key]: { ...(d[def.key] ?? {}), items: fn(d[def.key]?.items ?? []) } })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.setData, def.key],
  );
  return (
    <div>
      <Checklist items={items} onItems={onItems} readOnly={ctx.readOnly} addLabel={def.addLabel} />
      <CustomFields sectionKey={def.key} ctx={ctx} />
    </div>
  );
}

function LightningSection({ def, ctx }: { def: SectionDef; ctx: SectionCtx }) {
  const block = ctx.data.lightning ?? {};
  const set = (patch: Record<string, any>) => ctx.setData((d) => ({ ...d, lightning: { ...(d.lightning ?? {}), ...patch } }));
  const onItems = useCallback(
    (fn: (i: CheckItem[]) => CheckItem[]) => ctx.setData((d) => ({ ...d, lightning: { ...(d.lightning ?? {}), items: fn(d.lightning?.items ?? []) } })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.setData],
  );
  return (
    <div className="space-y-4">
      <Toggle checked={!!block.present} onChange={(v) => set({ present: v })} disabled={ctx.readOnly} label="Na obiekcie jest instalacja odgromowa" />
      {block.present && (
        <>
          <Checklist items={block.items ?? []} onItems={onItems} readOnly={ctx.readOnly} addLabel={def.addLabel} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel hint="Ω">Rezystancja uziemienia</FieldLabel>
              <NumberInput value={block.earthingResistance} onChange={(v) => set({ earthingResistance: v })} disabled={ctx.readOnly} unit="Ω" aria-label="Rezystancja uziemienia" />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Uwagi</FieldLabel>
              <TextInput multiline value={block.notes} onChange={(v) => set({ notes: v })} disabled={ctx.readOnly} aria-label="Uwagi do instalacji odgromowej" />
            </div>
          </div>
        </>
      )}
      <CustomFields sectionKey={def.key} ctx={ctx} />
    </div>
  );
}

function ExtrasSection({ ctx }: { ctx: SectionCtx }) {
  const block = ctx.data.extras ?? {};
  const set = (patch: Record<string, any>) => ctx.setData((d) => ({ ...d, extras: { ...(d.extras ?? {}), ...patch } }));
  return (
    <div>
      <p className="mb-3 text-sm text-zinc-400">Zaznacz instalacje występujące na obiekcie — pojawią się odpowiednie sekcje do wypełnienia.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ctx.schema.constants.extrasFlags.map((f) => (
          <Toggle key={f.key} label={f.label} checked={block[f.key] === true} disabled={ctx.readOnly} onChange={(v) => set({ [f.key]: v })} />
        ))}
      </div>
      {block.other === true && (
        <div className="mt-3">
          <FieldLabel>Nazwa — „Inne”</FieldLabel>
          <TextInput value={block.otherName} onChange={(v) => set({ otherName: v })} disabled={ctx.readOnly} aria-label="Nazwa innej instalacji" />
        </div>
      )}
    </div>
  );
}

function ConclusionsSection({ ctx }: { ctx: SectionCtx }) {
  const block = ctx.data.conclusions ?? {};
  const set = (patch: Record<string, any>) => ctx.setData((d) => ({ ...d, conclusions: { ...(d.conclusions ?? {}), ...patch } }));
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Wnioski i zalecenia</FieldLabel>
        <TextInput multiline value={block.text} onChange={(v) => set({ text: v })} disabled={ctx.readOnly} aria-label="Wnioski i zalecenia" />
      </div>
      <div>
        <FieldLabel>Ocena końcowa</FieldLabel>
        <p className="mb-2 text-xs text-zinc-500">Ocenę wybierasz świadomie — aplikacja nigdy nie ustawia jej sama.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ctx.schema.constants.finalRatings.map((r) => {
            const active = block.finalRating === r.value;
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={active}
                disabled={ctx.readOnly}
                onClick={() => set({ finalRating: active ? null : r.value, ratingConfirmedAt: active ? null : new Date().toISOString() })}
                className={cn(
                  'min-h-[44px] rounded-lg border px-3 text-left text-sm disabled:opacity-60',
                  active ? 'border-orange-500 bg-orange-950/40 text-orange-100' : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800',
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      <CustomFields sectionKey="conclusions" ctx={ctx} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dyspozytor sekcji
// ---------------------------------------------------------------------------

export function SectionBody({ def, ctx }: { def: SectionDef; ctx: SectionCtx }) {
  if (def.isCustom) return def.columns?.length ? <TableSection def={def} ctx={ctx} /> : <FieldsSection def={def} ctx={ctx} />;
  switch (def.kind) {
    case 'fields': return <FieldsSection def={def} ctx={ctx} />;
    case 'table': return <TableSection def={def} ctx={ctx} />;
    case 'checklist': return <ChecklistSection def={def} ctx={ctx} />;
    case 'lightning': return <LightningSection def={def} ctx={ctx} />;
    case 'extras': return <ExtrasSection ctx={ctx} />;
    case 'conclusions': return <ConclusionsSection ctx={ctx} />;
    default: return null;
  }
}
