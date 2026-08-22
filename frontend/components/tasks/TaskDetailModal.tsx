'use client';

import { useEffect, useState } from 'react';
import { Loader2, Clock, MapPin, User, X as XIcon, Play, Pause, CircleAlert, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { fieldClass, labelClass } from '@/components/ui/modal';

type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'ON_HOLD' | 'CANCELLED';

interface TimeEntryRaw {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  totalMinutes: number | null;
}

interface HistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string };
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  progress: number;
  dueDate: string | null;
  plannedMinutes: number | null;
  waitReason: string | null;
  holdReason: string | null;
  completionSummary: string | null;
  completionComment: string | null;
  startedAt: string | null;
  completedAt: string | null;
  site: { id: string; name: string; address?: string } | null;
  assignees: { user: { id: string; firstName: string; lastName: string } }[];
  history: HistoryEntry[];
  timeEntries: TimeEntryRaw[];
  actualMinutes: number;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: 'Nowe', IN_PROGRESS: 'W trakcie', WAITING: 'Oczekujące',
  DONE: 'Zakończone', ON_HOLD: 'Wstrzymane', CANCELLED: 'Anulowane',
};

const WAIT_REASONS = [
  'Oczekiwanie na materiał', 'Oczekiwanie na decyzję klienta',
  'Oczekiwanie na innego wykonawcę', 'Brak dostępu do budowy', 'Inny',
];
const HOLD_REASONS = [
  'Warunki pogodowe', 'Problem techniczny', 'Zmiana priorytetów', 'Inny',
];

function formatMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} godz. ${m} min` : `${m} min`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL');
}

// Prosty formularz "powód + opcjonalny komentarz" — współdzielony przez
// akcje Oczekujące/Wstrzymane (punkty 4/5 specyfikacji: lista gotowych
// powodów + możliwość wpisania własnego, powód wymagany).
function ReasonForm({
  reasons, onCancel, onConfirm, submitting,
}: { reasons: string[]; onCancel: () => void; onConfirm: (reason: string) => void; submitting: boolean }) {
  const [selected, setSelected] = useState(reasons[0]);
  const [custom, setCustom] = useState('');
  const isOther = selected === 'Inny';
  const finalReason = isOther ? custom.trim() : selected;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
      <label className={labelClass}>Powód</label>
      <select value={selected} onChange={(e) => setSelected(e.target.value)} className={fieldClass}>
        {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {isOther && (
        <>
          <label className={labelClass}>Opisz powód</label>
          <textarea rows={2} value={custom} onChange={(e) => setCustom(e.target.value)} className={fieldClass} autoFocus />
        </>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} className="border-zinc-700 text-zinc-300">Anuluj</Button>
        <Button
          type="button" size="sm" disabled={!finalReason || submitting}
          onClick={() => onConfirm(finalReason)}
          className="bg-orange-600 text-white hover:bg-orange-500"
        >
          {submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Potwierdź
        </Button>
      </div>
    </div>
  );
}

// Formularz zakończenia — podsumowanie wymagane, komentarz opcjonalny
// (punkt 7 specyfikacji)
function CompletionForm({
  onCancel, onConfirm, submitting,
}: { onCancel: () => void; onConfirm: (summary: string, comment: string) => void; submitting: boolean }) {
  const [summary, setSummary] = useState('');
  const [comment, setComment] = useState('');

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
      <label className={labelClass}>Podsumowanie wykonania</label>
      <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="np. Zamontowano rozdzielnicę, podłączono zabezpieczenia i wykonano pomiary." className={fieldClass} autoFocus />
      <label className={labelClass}>Komentarz / dodatkowe prace (opcjonalnie)</label>
      <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="np. Dodatkowo wymieniono uszkodzone gniazdo w garażu." className={fieldClass} />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} className="border-zinc-700 text-zinc-300">Anuluj</Button>
        <Button
          type="button" size="sm" disabled={!summary.trim() || submitting}
          onClick={() => onConfirm(summary.trim(), comment.trim())}
          className="bg-emerald-700 text-white hover:bg-emerald-600"
        >
          {submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Zakończ zadanie
        </Button>
      </div>
    </div>
  );
}

interface TaskDetailModalProps {
  taskId: string;
  currentUserId: string;
  isPrivileged: boolean;
  onClose: () => void;
  onChanged: () => void; // odśwież tablicę zadań w komponencie nadrzędnym
}

export function TaskDetailModal({ taskId, currentUserId, isPrivileged, onClose, onChanged }: TaskDetailModalProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [activeForm, setActiveForm] = useState<'wait' | 'hold' | 'complete' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    apiClient<TaskDetail>(`/api/tasks/${taskId}`).then(setTask).catch(() => setTask(null));
  };
  useEffect(() => { load(); }, [taskId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changeStatus = async (status: TaskStatus, extra?: { reason?: string; summary?: string; comment?: string }) => {
    setSubmitting(true);
    try {
      await apiClient(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: { status, ...extra } });
      setActiveForm(null);
      load();
      onChanged();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  // Instalator widzi akcje tylko dla własnych zadań; admin/kierownik
  // mogą wykonać akcję "w imieniu" instalatora (patrz TasksService —
  // walidacja reason/summary jest niezależna od roli).
  const canAct = isPrivileged || task.assignees.some((a) => a.user.id === currentUserId);
  const perDay = task.timeEntries.reduce<Record<string, number>>((acc, e) => {
    const key = e.date.slice(0, 10);
    acc[key] = (acc[key] ?? 0) + (e.totalMinutes ?? 0);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{task.title}</h2>
            <p className="mt-0.5 text-sm text-zinc-500">{STATUS_LABELS[task.status]}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* ---- Informacje podstawowe (punkt 10 specyfikacji) ---- */}
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
          {task.site && (
            <div className="col-span-2 flex items-center gap-1.5 text-zinc-300">
              <MapPin className="h-3.5 w-3.5 text-zinc-500" /> {task.site.name}
              {task.site.address && <span className="text-zinc-500">— {task.site.address}</span>}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-zinc-300">
            <User className="h-3.5 w-3.5 text-zinc-500" />
            {task.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(', ') || '—'}
          </div>
          <div className="flex items-center gap-1.5 text-zinc-300">
            <Clock className="h-3.5 w-3.5 text-zinc-500" />
            Termin: {task.dueDate ? new Date(task.dueDate).toLocaleDateString('pl-PL') : '—'}
          </div>
          {task.description && <p className="col-span-2 text-zinc-400">{task.description}</p>}
        </div>

        {/* ---- Bieżący powód / podsumowanie (jeśli dotyczy) ---- */}
        {task.status === 'WAITING' && task.waitReason && (
          <div className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/30 p-3 text-sm text-amber-200">
            <strong>Powód oczekiwania:</strong> {task.waitReason}
          </div>
        )}
        {task.status === 'ON_HOLD' && task.holdReason && (
          <div className="mb-4 rounded-lg border border-red-800/40 bg-red-950/30 p-3 text-sm text-red-200">
            <strong>Powód wstrzymania:</strong> {task.holdReason}
          </div>
        )}
        {task.status === 'DONE' && task.completionSummary && (
          <div className="mb-4 rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            <strong>Podsumowanie:</strong> {task.completionSummary}
            {task.completionComment && <p className="mt-1 text-emerald-300/80">{task.completionComment}</p>}
          </div>
        )}

        {/* ---- Akcje (punkty 3-7 specyfikacji) ---- */}
        {canAct && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
          <div className="mb-4 space-y-2">
            {activeForm === 'wait' && (
              <ReasonForm reasons={WAIT_REASONS} submitting={submitting} onCancel={() => setActiveForm(null)}
                onConfirm={(reason) => changeStatus('WAITING', { reason })} />
            )}
            {activeForm === 'hold' && (
              <ReasonForm reasons={HOLD_REASONS} submitting={submitting} onCancel={() => setActiveForm(null)}
                onConfirm={(reason) => changeStatus('ON_HOLD', { reason })} />
            )}
            {activeForm === 'complete' && (
              <CompletionForm submitting={submitting} onCancel={() => setActiveForm(null)}
                onConfirm={(summary, comment) => changeStatus('DONE', { summary, comment: comment || undefined })} />
            )}

            {!activeForm && task.status === 'NEW' && (
              <Button onClick={() => changeStatus('IN_PROGRESS')} disabled={submitting} className="w-full bg-orange-600 text-white hover:bg-orange-500">
                <Play className="mr-1.5 h-4 w-4" /> Rozpocznij zadanie
              </Button>
            )}
            {!activeForm && task.status === 'IN_PROGRESS' && (
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="outline" onClick={() => setActiveForm('wait')} className="border-amber-800 text-amber-400 hover:bg-amber-950">
                  <CircleAlert className="mr-1 h-3.5 w-3.5" /> Oczekujące
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveForm('hold')} className="border-red-800 text-red-400 hover:bg-red-950">
                  <Pause className="mr-1 h-3.5 w-3.5" /> Wstrzymaj
                </Button>
                <Button size="sm" onClick={() => setActiveForm('complete')} className="bg-emerald-700 text-white hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Zakończ
                </Button>
              </div>
            )}
            {!activeForm && (task.status === 'WAITING' || task.status === 'ON_HOLD') && (
              <Button onClick={() => changeStatus('IN_PROGRESS')} disabled={submitting} className="w-full bg-orange-600 text-white hover:bg-orange-500">
                <Play className="mr-1.5 h-4 w-4" /> Wznów zadanie
              </Button>
            )}
          </div>
        )}

        {/* ---- Podsumowanie czasu (punkty 8/9 specyfikacji) ---- */}
        <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <h3 className="mb-2 text-sm font-semibold text-zinc-200">Czas pracy</h3>
          <div className="mb-2 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-zinc-500">Planowany</p><p className="text-zinc-200">{formatMinutes(task.plannedMinutes)}</p></div>
            <div><p className="text-zinc-500">Rzeczywisty</p><p className="text-zinc-200">{formatMinutes(task.actualMinutes)}</p></div>
            <div><p className="text-zinc-500">Rozpoczęto</p><p className="text-zinc-200">{formatDateTime(task.startedAt)}</p></div>
            <div><p className="text-zinc-500">Zakończono</p><p className="text-zinc-200">{formatDateTime(task.completedAt)}</p></div>
          </div>
          {Object.keys(perDay).length > 0 && (
            <div className="mt-2 space-y-1 border-t border-zinc-800 pt-2 text-xs">
              {Object.entries(perDay).map(([date, minutes]) => (
                <div key={date} className="flex justify-between text-zinc-400">
                  <span>{new Date(date).toLocaleDateString('pl-PL')}</span>
                  <span>{formatMinutes(minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Historia (punkt 11 specyfikacji) — tylko admin/kierownik ---- */}
        {isPrivileged && task.history.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">Historia</h3>
            <div className="space-y-1.5 text-xs">
              {task.history.map((h) => (
                <div key={h.id} className="text-zinc-500">
                  <span className="text-zinc-400">{formatDateTime(h.createdAt)}</span> — {h.user.firstName} {h.user.lastName}:{' '}
                  {h.field === 'status' ? `${STATUS_LABELS[h.oldValue as TaskStatus] ?? h.oldValue} → ${STATUS_LABELS[h.newValue as TaskStatus] ?? h.newValue}` : `${h.field}: ${h.newValue}`}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
