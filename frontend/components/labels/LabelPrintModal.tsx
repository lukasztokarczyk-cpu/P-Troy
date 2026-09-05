'use client';

import { useEffect, useState } from 'react';
import { Loader2, Printer, Wifi, WifiOff, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';
import {
  checkPrintAgent, listPrintAgentPrinters, sendZplToPrintAgent, type PrintAgentPrinter,
} from '@/lib/print-agent-client';

export type LabelTargetType =
  | 'RACK' | 'RACK_DEVICE' | 'RACK_DEVICE_PORT' | 'DISTRIBUTION_BOARD' | 'DISTRIBUTION_BOARD_DEVICE';

interface LabelTemplate {
  id: string; name: string; targetType: LabelTargetType; isSystem: boolean;
  widthMm: number; heightMm: number; includeQr: boolean; isWarning: boolean;
}

interface PrintJobResult {
  id: string;
  pdfUrl: string | null;
  zpl: string;
}

/**
 * Modal drukowania etykiet — wspólny dla całego P-Troy (sekcja 7
 * specyfikacji: "jeden centralny system"). Przyjmuje targetType i listę
 * recordIds (1 = pojedyncza etykieta, więcej = wydruk masowy).
 */
export function LabelPrintModal({
  open, onClose, targetType, recordIds, contextLabel,
}: {
  open: boolean;
  onClose: () => void;
  targetType: LabelTargetType;
  recordIds: string[];
  contextLabel: string; // np. "QF-01" albo "12 zaznaczonych aparatów"
}) {
  const [templates, setTemplates] = useState<LabelTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [copies, setCopies] = useState(1);
  const [customText, setCustomText] = useState('');
  const [onlyUnprinted, setOnlyUnprinted] = useState(false);

  const [agentStatus, setAgentStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [printers, setPrinters] = useState<PrintAgentPrinter[]>([]);
  const [printerId, setPrinterId] = useState('');

  const [job, setJob] = useState<PrintJobResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sendingToAgent, setSendingToAgent] = useState(false);
  const [markedPrinted, setMarkedPrinted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplateId(''); setJob(null); setError(''); setMarkedPrinted(false); setCustomText(''); setOnlyUnprinted(false); setCopies(1);
    apiClient<LabelTemplate[]>(`/api/label-templates?targetType=${targetType}`).then((t) => { setTemplates(t); if (t.length === 1) setTemplateId(t[0].id); });
    checkPrintAgent().then((r) => {
      setAgentStatus(r.ok ? 'online' : 'offline');
      if (r.ok) listPrintAgentPrinters().then((p) => { setPrinters(p); if (p.length === 1) setPrinterId(p[0].id); });
    });
  }, [open, targetType]);

  const selectedTemplate = templates?.find((t) => t.id === templateId) ?? null;

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setGenerating(true); setError(''); setJob(null); setMarkedPrinted(false);
    try {
      const result = await apiClient<PrintJobResult>('/api/print-jobs', {
        method: 'POST',
        body: {
          templateId,
          targetType,
          recordIds,
          copies,
          method: printerId ? 'print-agent' : 'browser',
          customText: selectedTemplate.isWarning ? customText : undefined,
          onlyUnprinted: recordIds.length > 1 ? onlyUnprinted : undefined,
        },
      });
      setJob(result);
    } catch (err: any) { setError(err.message); } finally { setGenerating(false); }
  };

  const handleBrowserPrint = () => {
    if (!job?.pdfUrl) return;
    window.open(job.pdfUrl, '_blank');
  };

  const handleMarkPrinted = async () => {
    if (!job) return;
    await apiClient(`/api/print-jobs/${job.id}/mark-printed`, { method: 'PATCH', body: { status: 'PRINTED' } }).catch(() => undefined);
    setMarkedPrinted(true);
  };

  const handleSendToAgent = async () => {
    if (!job || !printerId) return;
    setSendingToAgent(true); setError('');
    const result = await sendZplToPrintAgent(printerId, job.zpl);
    if (result.ok) {
      await apiClient(`/api/print-jobs/${job.id}/mark-printed`, { method: 'PATCH', body: { status: 'PRINTED' } }).catch(() => undefined);
      setMarkedPrinted(true);
    } else {
      setError(result.error || 'Nie udało się wysłać etykiety do drukarki');
      await apiClient(`/api/print-jobs/${job.id}/mark-printed`, { method: 'PATCH', body: { status: 'FAILED' } }).catch(() => undefined);
    }
    setSendingToAgent(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Drukuj etykietę" description={contextLabel} maxWidth="max-w-lg">
      {templates === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-zinc-500">Brak dostępnych szablonów dla tego typu elementu.</p>
      ) : (
        <>
          <label className={labelClass}>Szablon etykiety</label>
          <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setJob(null); }} className={fieldClass}>
            <option value="">— wybierz —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isWarning ? ' (ostrzegawcza)' : ''}</option>)}
          </select>

          {selectedTemplate?.isWarning && (
            <>
              <label className={labelClass}>Treść etykiety</label>
              <textarea rows={2} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="np. UWAGA NAPIĘCIE 230/400V" className={fieldClass} />
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Liczba kopii{recordIds.length > 1 ? ' (na element)' : ''}</label>
              <input type="number" min={1} value={copies} onChange={(e) => setCopies(Number(e.target.value))} className={fieldClass} />
            </div>
            {recordIds.length > 1 && (
              <div className="flex items-end pb-2.5">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={onlyUnprinted} onChange={(e) => setOnlyUnprinted(e.target.checked)} className="rounded border-zinc-700 bg-zinc-900" />
                  Tylko bez wcześniejszego wydruku
                </label>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
            {agentStatus === 'checking' && <><Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" /> <span className="text-zinc-500">Sprawdzanie P-Troy Print Agent…</span></>}
            {agentStatus === 'offline' && <><WifiOff className="h-3.5 w-3.5 text-zinc-600" /> <span className="text-zinc-500">Print Agent nieaktywny na tym komputerze — dostępny tylko wydruk przez przeglądarkę.</span></>}
            {agentStatus === 'online' && (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                {printers.length === 0 ? (
                  <span className="text-zinc-500">Print Agent aktywny, ale brak skonfigurowanych drukarek.</span>
                ) : (
                  <select value={printerId} onChange={(e) => setPrinterId(e.target.value)} className="ml-1 flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200">
                    <option value="">Drukuj przez przeglądarkę (PDF)</option>
                    {printers.map((p) => <option key={p.id} value={p.id}>Drukarka: {p.name}</option>)}
                  </select>
                )}
              </>
            )}
          </div>

          {error && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{error}</p>}

          {!job ? (
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">Anuluj</Button>
              <Button type="button" disabled={!templateId || generating || (selectedTemplate?.isWarning && !customText.trim())} onClick={handleGenerate} className="bg-orange-600 text-white hover:bg-orange-500">
                {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} Generuj etykietę
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {job.pdfUrl && (
                <iframe src={job.pdfUrl} className="h-64 w-full rounded-lg border border-zinc-800 bg-white" title="Podgląd etykiety" />
              )}
              {markedPrinted ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Oznaczono jako wydrukowane</p>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setJob(null)} className="border-zinc-700 text-zinc-300">Wstecz</Button>
                  {printerId ? (
                    <Button type="button" disabled={sendingToAgent} onClick={handleSendToAgent} className="bg-orange-600 text-white hover:bg-orange-500">
                      {sendingToAgent ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} Wyślij do drukarki
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={handleBrowserPrint} className="border-zinc-700 text-zinc-300">Otwórz PDF</Button>
                      <Button type="button" onClick={handleMarkPrinted} className="bg-orange-600 text-white hover:bg-orange-500">Oznacz jako wydrukowane</Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
