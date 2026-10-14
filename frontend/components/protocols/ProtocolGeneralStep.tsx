'use client';

import Link from 'next/link';
import { type ProtocolDetail, EXTERNAL_PERFORMER_FIELDS, EXTERNAL_SITE_FIELDS, STATUS_LABELS, formatDate } from '@/lib/protocols';
import { DateInput, FieldLabel, SelectInput, TextInput, inputCls } from './ProtocolInputs';

export interface ProtocolMeta {
  performedAt: string;
  startedAt: string;
  finishedAt: string;
  nextInspectionDate: string;
  status: string;
  description: string;
}

const EDITABLE_STATUSES = ['DRAFT', 'TODO', 'IN_PROGRESS', 'NEEDS_FIXES'];

const toLocalDt = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) : '');

/** Dane ogólne: obiekt (tylko do odczytu — zmiana danych budowy robi się w module Budowy), daty, status. */
export function ProtocolGeneralStep({
  protocol,
  meta,
  onMeta,
  readOnly,
}: {
  protocol: ProtocolDetail;
  meta: ProtocolMeta;
  onMeta: (patch: Partial<ProtocolMeta>) => void;
  readOnly: boolean;
}) {
  const info = protocol.site;
  const siteRows = EXTERNAL_SITE_FIELDS.map((f) => ({ label: f.label, value: (info as any)?.[f.key] as string })).filter((r) => r.value);
  const ext = protocol.performerExternal;
  const performerRows = ext
    ? EXTERNAL_PERFORMER_FIELDS.map((f) => ({ label: f.label, value: ext[f.key] as string })).filter((r) => r.value)
    : [
        { label: 'Imię i nazwisko', value: protocol.performer.name },
        { label: 'Telefon', value: protocol.performer.phone ?? '' },
        { label: 'E-mail', value: protocol.performer.email ?? '' },
      ].filter((r) => r.value);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-100">Obiekt</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {siteRows.map((r) => (
            <div key={r.label} className="flex gap-2">
              <dt className="w-36 shrink-0 text-zinc-500">{r.label}</dt>
              <dd className="text-zinc-200">{r.value}</dd>
            </div>
          ))}
        </dl>
        {protocol.siteId && (
          <p className="mt-2 text-xs text-zinc-500">
            Dane pochodzą z modułu Budowy ({protocol.approvedAt ? 'zapisane w protokole w chwili zatwierdzenia' : 'zostaną zapisane w protokole przy zatwierdzeniu'}).{' '}
            <Link href={`/sites/${protocol.siteId}`} className="text-orange-400 hover:underline">Otwórz budowę</Link>
          </p>
        )}
        {!protocol.siteId && <p className="mt-2 text-xs text-zinc-500">Obiekt spoza bazy P-Troy — dane zapisane razem z protokołem.</p>}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-100">Osoba wykonująca</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {performerRows.map((r) => (
            <div key={r.label} className="flex gap-2">
              <dt className="w-36 shrink-0 text-zinc-500">{r.label}</dt>
              <dd className="text-zinc-200">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Data wykonania</FieldLabel>
          <DateInput value={meta.performedAt} onChange={(v) => onMeta({ performedAt: v })} disabled={readOnly} aria-label="Data wykonania" />
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          {protocol.approvedAt ? (
            <p className="flex min-h-[44px] items-center text-sm text-emerald-300">{STATUS_LABELS.COMPLETED}</p>
          ) : (
            <select
              className={inputCls}
              value={meta.status}
              disabled={readOnly}
              aria-label="Status protokołu"
              onChange={(e) => onMeta({ status: e.target.value })}
            >
              {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          )}
        </div>
        <div>
          <FieldLabel>Początek badań</FieldLabel>
          <input type="datetime-local" className={inputCls} value={toLocalDt(meta.startedAt)} disabled={readOnly} aria-label="Początek badań" onChange={(e) => onMeta({ startedAt: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Koniec badań</FieldLabel>
          <input type="datetime-local" className={inputCls} value={toLocalDt(meta.finishedAt)} disabled={readOnly} aria-label="Koniec badań" onChange={(e) => onMeta({ finishedAt: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Opis / uwagi ogólne</FieldLabel>
          <TextInput multiline value={meta.description} onChange={(v) => onMeta({ description: v })} disabled={readOnly} aria-label="Opis" />
        </div>
      </section>
      <p className="text-xs text-zinc-600">Wykonano: {formatDate(protocol.performedAt)}</p>
    </div>
  );
}
