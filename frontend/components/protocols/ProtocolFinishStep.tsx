'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, Loader2, Lock, Trash2, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { BAND_STYLES, type ProtocolDetail, daysLabel, errorMessage, formatDate } from '@/lib/protocols';
import { DateInput, FieldLabel, TextInput } from './ProtocolInputs';
import { openPdf } from './ProtocolModals';

interface Issue { code: string; message: string; section?: string }
interface Validation { errors: Issue[]; warnings: Issue[] }

/**
 * Ostatni krok: kontrola kompletności, podpisy, termin następnego badania i zatwierdzenie.
 * Zatwierdzenie jest świadomą decyzją uprawnionej osoby (administrator / kierownik).
 */
export function ProtocolFinishStep({
  protocol,
  nextInspectionDate,
  onNextDate,
  qualifications,
  onQualifications,
  flush,
  onProtocol,
  onGoToSection,
}: {
  protocol: ProtocolDetail;
  nextInspectionDate: string;
  onNextDate: (v: string) => void;
  qualifications: string;
  onQualifications: (v: string) => void;
  /** Zapisuje niezapisane zmiany przed akcją na serwerze. */
  flush: () => Promise<void>;
  onProtocol: (p: ProtocolDetail) => void;
  onGoToSection?: (key: string) => void;
}) {
  const [validation, setValidation] = useState<Validation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [serverIssues, setServerIssues] = useState<Validation | null>(null);

  const approved = !!protocol.approvedAt;
  const canEdit = protocol.permissions.canEdit && !approved;

  const runValidate = useCallback(async () => {
    setBusy('validate');
    setError('');
    try {
      await flush();
      setValidation(await apiClient<Validation>(`/api/protocols/${protocol.id}/validate`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [protocol.id, flush]);

  useEffect(() => {
    if (!approved && !protocol.isLegacy) runValidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol.id]);

  const sig = (role: 'PERFORMER' | 'REPRESENTATIVE') => protocol.signatures.find((s) => s.role === role);

  const submitSignature = async (role: 'PERFORMER' | 'REPRESENTATIVE', payload: { signerName: string; inputMethod: string; signatureImageBase64: string }) => {
    setError('');
    await flush();
    const res = await apiClient<ProtocolDetail>(`/api/protocols/${protocol.id}/signatures`, {
      method: 'POST',
      body: {
        role,
        signerName: payload.signerName,
        inputMethod: payload.inputMethod,
        signatureImageBase64: payload.signatureImageBase64,
        ...(role === 'PERFORMER' && qualifications.trim() ? { qualifications: qualifications.trim() } : {}),
      },
    });
    onProtocol(res);
    runValidate();
  };

  const removeSignature = async (role: 'PERFORMER' | 'REPRESENTATIVE') => {
    setBusy(`rm-${role}`);
    setError('');
    try {
      await flush();
      onProtocol(await apiClient<ProtocolDetail>(`/api/protocols/${protocol.id}/signatures/${role}`, { method: 'DELETE' }));
      runValidate();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    setBusy('approve');
    setError('');
    setServerIssues(null);
    try {
      await flush();
      const res = await apiClient<{ protocol: ProtocolDetail; warnings: Issue[] }>(`/api/protocols/${protocol.id}/approve`, { method: 'POST' });
      onProtocol(res.protocol);
    } catch (e: any) {
      setError(errorMessage(e));
      if (e?.body?.errors) setServerIssues({ errors: e.body.errors, warnings: e.body.warnings ?? [] });
    } finally {
      setBusy(null);
    }
  };

  const toggleDeadline = async () => {
    setBusy('deadline');
    try {
      onProtocol(await apiClient<ProtocolDetail>(`/api/protocols/${protocol.id}/deadline`, { method: 'POST', body: { closed: !protocol.deadlineClosedAt } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const openFullPdf = async () => {
    setBusy('pdf');
    const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      await flush();
      if (approved && protocol.pdfUrl) {
        openPdf(protocol.pdfUrl, win);
      } else {
        const res = await apiClient<{ pdfUrl: string }>(`/api/protocols/${protocol.id}/print`, { method: 'POST', body: { mode: 'FULL', action: 'DOWNLOAD' } });
        openPdf(res.pdfUrl, win);
      }
    } catch (e) {
      win?.close();
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const issues = serverIssues ?? validation;

  return (
    <div className="space-y-6" data-testid="finish-step">
      {/* Kontrola kompletności */}
      {!approved && (
        <section className="rounded-xl border border-zinc-800 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">Kontrola przed zatwierdzeniem</h3>
            <Button size="sm" variant="outline" onClick={runValidate} disabled={busy === 'validate'}>
              {busy === 'validate' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Sprawdź ponownie
            </Button>
          </div>
          {issues && issues.errors.length === 0 && <p className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Brak błędów blokujących zatwierdzenie.</p>}
          {issues?.errors.map((i, n) => (
            <p key={n} className="mt-1 flex items-start gap-2 text-sm text-red-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {i.message}
                {i.section && onGoToSection && <button type="button" className="ml-2 text-xs underline" onClick={() => onGoToSection(i.section!)}>przejdź</button>}
              </span>
            </p>
          ))}
          {issues?.warnings.map((i, n) => (
            <p key={n} className="mt-1 flex items-start gap-2 text-sm text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {i.message}
                {i.section && onGoToSection && <button type="button" className="ml-2 text-xs underline" onClick={() => onGoToSection(i.section!)}>przejdź</button>}
              </span>
            </p>
          ))}
          {issues && issues.warnings.length > 0 && <p className="mt-2 text-xs text-zinc-500">Ostrzeżenia nie blokują zatwierdzenia.</p>}
        </section>
      )}

      {/* Termin następnego badania */}
      <section className="rounded-xl border border-zinc-800 p-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-100">Termin następnego badania</h3>
        <div className="max-w-xs">
          <DateInput value={nextInspectionDate} onChange={onNextDate} disabled={!(approved ? protocol.permissions.canEditNextDate : canEdit)} aria-label="Termin następnego badania" />
        </div>
        {protocol.nextInspectionDate && protocol.band && (
          <p className={`mt-2 inline-block rounded-full px-3 py-1 text-xs ${BAND_STYLES[protocol.band].chip}`}>
            {formatDate(protocol.nextInspectionDate)} · {daysLabel(protocol.daysToNext)}
          </p>
        )}
        {approved && protocol.nextInspectionDate && protocol.permissions.canEdit && (
          <div className="mt-3">
            <Button size="sm" variant="outline" disabled={busy === 'deadline'} onClick={toggleDeadline}>
              {protocol.deadlineClosedAt ? 'Otwórz termin ponownie' : 'Zamknij termin (badanie wykonano / nie dotyczy)'}
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">Przypomnienia dostaniesz 14 i 7 dni przed terminem, w dniu terminu oraz po jego przekroczeniu.</p>
      </section>

      {/* Podpisy */}
      <section className="rounded-xl border border-zinc-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-100">Podpisy</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(['PERFORMER', 'REPRESENTATIVE'] as const).map((role) => {
            const s = sig(role);
            const title = role === 'PERFORMER' ? 'Osoba wykonująca badanie' : 'Właściciel / zarządca / przedstawiciel';
            return (
              <div key={role} data-testid={`sig-${role}`}>
                <p className="mb-2 text-xs text-zinc-400">{title}</p>
                {s ? (
                  <div className="rounded-lg border border-zinc-700 p-3">
                    <div className="rounded bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.imageUrl} alt={`Podpis: ${s.signerName}`} className="mx-auto h-24 object-contain" />
                    </div>
                    <p className="mt-2 text-sm text-zinc-200">{s.signerName}</p>
                    <p className="text-xs text-zinc-500">podpisano {new Date(s.signedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}</p>
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="mt-2 text-red-400" disabled={busy === `rm-${role}`} onClick={() => removeSignature(role)}>
                        <Trash2 className="mr-1 h-3 w-3" />Usuń podpis
                      </Button>
                    )}
                  </div>
                ) : canEdit ? (
                  <>
                    {role === 'PERFORMER' && (
                      <div className="mb-2">
                        <FieldLabel>Uprawnienia (np. nr i zakres)</FieldLabel>
                        <TextInput value={qualifications} onChange={onQualifications} aria-label="Uprawnienia" />
                      </div>
                    )}
                    <SignaturePad
                      signerRole={role === 'PERFORMER' ? 'INSTALLER' : 'CLIENT'}
                      defaultSignerName={role === 'PERFORMER' ? protocol.performer.name : ''}
                      exportDarkInk
                      title={title}
                      footerNote={null}
                      onSubmit={(p) => submitSignature(role, p)}
                    />
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">Brak podpisu.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Akcje */}
      <section className="rounded-xl border border-zinc-800 p-4">
        {approved ? (
          <p className="mb-3 flex items-center gap-2 text-sm text-emerald-300">
            <Lock className="h-4 w-4" /> Protokół zatwierdzony {protocol.approvedAt && new Date(protocol.approvedAt).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}
            {protocol.approvedBy ? ` przez ${protocol.approvedBy.name}` : ''}. To dokument historyczny — nie można go edytować.
          </p>
        ) : (
          <p className="mb-3 text-xs text-zinc-500">Po zatwierdzeniu protokół zostaje zablokowany, a dane obiektu zapisane na ten dzień.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openFullPdf} disabled={busy === 'pdf'}>
            {busy === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            {approved ? 'Pobierz PDF' : 'Podgląd PDF (wersja robocza)'}
          </Button>
          {!approved && protocol.permissions.canApprove && (
            <Button onClick={approve} disabled={busy === 'approve' || (validation?.errors.length ?? 0) > 0}>
              {busy === 'approve' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Zatwierdź protokół
            </Button>
          )}
        </div>
        {!approved && !protocol.permissions.canApprove && <p className="mt-2 text-xs text-zinc-500">Protokół zatwierdza administrator lub kierownik.</p>}
      </section>

      {error && <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}
    </div>
  );
}
