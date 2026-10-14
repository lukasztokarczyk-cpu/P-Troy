'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';
import {
  EXTERNAL_PERFORMER_FIELDS,
  EXTERNAL_SITE_FIELDS,
  INSPECTION_KIND_OPTIONS,
  OBJECT_TYPE_OPTIONS,
  type ObjectType,
  type ProtocolListItem,
  errorMessage,
  formatDate,
  todayYmd,
} from '@/lib/protocols';

interface SiteLite { id: string; name: string; address?: string }
interface Performer { id: string; name: string }

type Step = 1 | 2 | 3;

/** Kreator nowego protokołu: 1) obiekt i budowa, 2) rodzaj badania i wykonawca, 3) podsumowanie. */
export function NewProtocolWizard({ open, onClose, presetSiteId }: { open: boolean; onClose: () => void; presetSiteId?: string }) {
  const router = useRouter();
  const { user, isPrivileged } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [objectType, setObjectType] = useState<ObjectType | ''>('');
  const [objectTypeName, setObjectTypeName] = useState('');
  const [siteMode, setSiteMode] = useState<'SITE' | 'EXTERNAL'>('SITE');
  const [siteId, setSiteId] = useState(presetSiteId ?? '');
  const [external, setExternal] = useState<Record<string, string>>({});
  const [addToSites, setAddToSites] = useState(false);

  const [inspectionKind, setInspectionKind] = useState('PERIODIC');
  const [inspectionKindName, setInspectionKindName] = useState('');
  const [performedAt, setPerformedAt] = useState(todayYmd());
  const [nextDate, setNextDate] = useState('');
  const [performerMode, setPerformerMode] = useState<'USER' | 'EXTERNAL'>('USER');
  const [performerUserId, setPerformerUserId] = useState('');
  const [performerExt, setPerformerExt] = useState<Record<string, string>>({});
  const [previousId, setPreviousId] = useState('');

  const [sites, setSites] = useState<SiteLite[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [previous, setPrevious] = useState<ProtocolListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError('');
    setObjectType('');
    setObjectTypeName('');
    setSiteMode('SITE');
    setSiteId(presetSiteId ?? '');
    setExternal({});
    setAddToSites(false);
    setInspectionKind('PERIODIC');
    setInspectionKindName('');
    setPerformedAt(todayYmd());
    setNextDate('');
    setPerformerMode('USER');
    setPerformerUserId(user?.id ?? '');
    setPerformerExt({});
    setPreviousId('');
    apiClient<SiteLite[]>('/api/sites').then(setSites).catch(() => setSites([]));
    apiClient<Performer[]>('/api/protocols/performers').then(setPerformers).catch(() => setPerformers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Poprzednie protokoły tej budowy — do „Utwórz na podstawie poprzedniego”
  useEffect(() => {
    setPreviousId('');
    if (!open || siteMode !== 'SITE' || !siteId) { setPrevious([]); return; }
    apiClient<ProtocolListItem[]>(`/api/protocols/site/${siteId}`)
      .then((l) => setPrevious(l.filter((p) => !p.isLegacy)))
      .catch(() => setPrevious([]));
  }, [open, siteMode, siteId]);

  const step1Ok =
    !!objectType &&
    (objectType !== 'OTHER' || objectTypeName.trim().length > 0) &&
    (siteMode === 'SITE' ? !!siteId : !!external.name?.trim());
  const step2Ok = !!performedAt && (inspectionKind !== 'OTHER' || inspectionKindName.trim().length > 0) &&
    (performerMode === 'USER' ? !!performerUserId : !!performerExt.name?.trim());

  const siteName = useMemo(() => (siteMode === 'SITE' ? sites.find((s) => s.id === siteId)?.name ?? '' : external.name ?? ''), [siteMode, sites, siteId, external]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()]));
      const body: Record<string, any> = {
        objectType,
        ...(objectType === 'OTHER' ? { objectTypeName: objectTypeName.trim() } : {}),
        inspectionKind,
        ...(inspectionKind === 'OTHER' ? { inspectionKindName: inspectionKindName.trim() } : {}),
        performedAt,
        ...(nextDate ? { nextInspectionDate: nextDate } : {}),
        ...(siteMode === 'SITE' ? { siteId } : { externalSite: clean(external), ...(isPrivileged && addToSites ? { addExternalToSites: true } : {}) }),
        ...(performerMode === 'USER' ? { performerUserId } : { performerExternal: clean(performerExt) }),
        ...(previousId ? { previousProtocolId: previousId } : {}),
      };
      const created = await apiClient<{ id: string }>('/api/protocols', { method: 'POST', body });
      onClose();
      router.push(`/protocols/${created.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-[44px] rounded-lg border px-3 text-left text-sm ${active ? 'border-orange-500 bg-orange-950/40 text-orange-100' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}>
      {children}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title="Nowy protokół" description={`Krok ${step} z 3`} maxWidth="max-w-xl" closeOnOverlayClick={false}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Typ obiektu</label>
              <div className="grid grid-cols-1 gap-2">
                {OBJECT_TYPE_OPTIONS.map((o) => (
                  <Chip key={o.value} active={objectType === o.value} onClick={() => setObjectType(o.value)}>
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-xs text-zinc-500">{o.hint}</span>
                  </Chip>
                ))}
              </div>
              {objectType === 'OTHER' && (
                <input className={`${fieldClass} mt-2`} placeholder="Nazwa typu obiektu (np. hala magazynowa)" value={objectTypeName} onChange={(e) => setObjectTypeName(e.target.value)} aria-label="Nazwa typu obiektu" />
              )}
            </div>

            <div>
              <label className={labelClass}>Budowa / obiekt</label>
              <div className="grid grid-cols-2 gap-2">
                <Chip active={siteMode === 'SITE'} onClick={() => setSiteMode('SITE')}>Budowa z P-Troy</Chip>
                <Chip active={siteMode === 'EXTERNAL'} onClick={() => setSiteMode('EXTERNAL')}>Obiekt spoza P-Troy</Chip>
              </div>
              {siteMode === 'SITE' ? (
                <select className={`${fieldClass} mt-2`} value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Budowa">
                  <option value="">Wybierz budowę…</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>)}
                </select>
              ) : (
                <div className="mt-2 space-y-2">
                  {EXTERNAL_SITE_FIELDS.map((f) => (
                    <input key={f.key} className={fieldClass} placeholder={f.label + (f.required ? ' *' : '')} value={external[f.key] ?? ''} onChange={(e) => setExternal({ ...external, [f.key]: e.target.value })} aria-label={f.label} />
                  ))}
                  {isPrivileged && (
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={addToSites} onChange={(e) => setAddToSites(e.target.checked)} />
                      Dodaj również tę budowę do bazy P-Troy
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Rodzaj badania</label>
              <select className={fieldClass} value={inspectionKind} onChange={(e) => setInspectionKind(e.target.value)} aria-label="Rodzaj badania">
                {INSPECTION_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {inspectionKind === 'OTHER' && (
                <input className={`${fieldClass} mt-2`} placeholder="Nazwa rodzaju badania" value={inspectionKindName} onChange={(e) => setInspectionKindName(e.target.value)} aria-label="Nazwa rodzaju badania" />
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Data wykonania</label>
                <input type="date" className={fieldClass} value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} aria-label="Data wykonania" />
              </div>
              <div>
                <label className={labelClass}>Termin następnego badania (opcjonalnie)</label>
                <input type="date" className={fieldClass} value={nextDate} onChange={(e) => setNextDate(e.target.value)} aria-label="Termin następnego badania" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Osoba wykonująca</label>
              {isPrivileged && (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <Chip active={performerMode === 'USER'} onClick={() => setPerformerMode('USER')}>Użytkownik P-Troy</Chip>
                  <Chip active={performerMode === 'EXTERNAL'} onClick={() => setPerformerMode('EXTERNAL')}>Osoba z zewnątrz</Chip>
                </div>
              )}
              {performerMode === 'USER' ? (
                <select className={fieldClass} value={performerUserId} onChange={(e) => setPerformerUserId(e.target.value)} aria-label="Osoba wykonująca">
                  <option value="">Wybierz…</option>
                  {performers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <div className="space-y-2">
                  {EXTERNAL_PERFORMER_FIELDS.map((f) => (
                    <input key={f.key} className={fieldClass} placeholder={f.label} value={performerExt[f.key] ?? ''} onChange={(e) => setPerformerExt({ ...performerExt, [f.key]: e.target.value })} aria-label={f.label} />
                  ))}
                </div>
              )}
            </div>
            {previous.length > 0 && (
              <div>
                <label className={labelClass}>Utwórz na podstawie poprzedniego protokołu (kopiuje strukturę, bez wyników)</label>
                <select className={fieldClass} value={previousId} onChange={(e) => setPreviousId(e.target.value)} aria-label="Poprzedni protokół">
                  <option value="">Nie — pusty protokół</option>
                  {previous.map((p) => <option key={p.id} value={p.id}>{p.number} · {formatDate(p.performedAt)}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <dl className="space-y-2 text-sm">
            {[
              ['Typ obiektu', objectType === 'OTHER' ? objectTypeName : OBJECT_TYPE_OPTIONS.find((o) => o.value === objectType)?.label],
              ['Obiekt', siteName + (siteMode === 'EXTERNAL' ? ' (spoza P-Troy)' : '')],
              ['Rodzaj badania', inspectionKind === 'OTHER' ? inspectionKindName : INSPECTION_KIND_OPTIONS.find((o) => o.value === inspectionKind)?.label],
              ['Data wykonania', formatDate(performedAt)],
              ['Wykonawca', performerMode === 'USER' ? performers.find((p) => p.id === performerUserId)?.name : performerExt.name],
              ['Następne badanie', nextDate ? formatDate(nextDate) : 'ustawisz przy zatwierdzaniu'],
              ['Na podstawie', previousId ? previous.find((p) => p.id === previousId)?.number : 'pusty protokół'],
            ].map(([k, v]) => (
              <div key={k as string} className="flex gap-3"><dt className="w-36 shrink-0 text-zinc-500">{k}</dt><dd className="text-zinc-200">{v || '—'}</dd></div>
            ))}
            {siteMode === 'EXTERNAL' && isPrivileged && addToSites && <p className="text-xs text-zinc-500">Budowa zostanie też dodana do bazy P-Troy.</p>}
          </dl>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300" role="alert">{error}</p>}
      </div>

      <div className="mt-4 flex justify-between gap-2">
        <Button variant="ghost" onClick={step === 1 ? onClose : () => setStep((s) => (s - 1) as Step)}>{step === 1 ? 'Anuluj' : 'Wstecz'}</Button>
        {step < 3 ? (
          <Button disabled={step === 1 ? !step1Ok : !step2Ok} onClick={() => setStep((s) => (s + 1) as Step)}>Dalej</Button>
        ) : (
          <Button disabled={busy} onClick={create}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Utwórz protokół</Button>
        )}
      </div>
    </Modal>
  );
}
