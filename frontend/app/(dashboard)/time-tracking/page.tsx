'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface TimeEntry {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  totalMinutes: number | null;
  site?: { name: string } | null;
}
interface SiteOption { id: string; name: string; }

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

// Dla podglądu "od razu ile godzin przepracowane" podczas wypełniania formularza
function previewMinutes(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TimeTrackingPage() {
  const [today, setToday] = useState<TimeEntry | null | undefined>(undefined);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [sites, setSites] = useState<SiteOption[]>([]);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ date: todayIso(), startTime: '07:00', endTime: '17:00', siteId: '' });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const loadToday = useCallback(() => {
    apiClient<TimeEntry | null>('/api/time-tracking/today').then(setToday).catch(() => setToday(null));
  }, []);
  const loadEntries = useCallback(() => {
    apiClient<TimeEntry[]>('/api/time-tracking/my-entries').then(setEntries).catch(() => setEntries([]));
  }, []);

  useEffect(() => { loadToday(); loadEntries(); }, [loadToday, loadEntries]);
  useEffect(() => {
    apiClient<SiteOption[]>('/api/sites').then((list) => setSites(list.map((s: any) => ({ id: s.id, name: s.name })))).catch(() => setSites([]));
  }, []);

  useEffect(() => {
    if (!today || today.clockOut) return;
    const format = (ms: number) => {
      const s = Math.floor(ms / 1000);
      return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
    };
    const interval = setInterval(() => setElapsed(format(Date.now() - new Date(today.clockIn).getTime())), 1000);
    return () => clearInterval(interval);
  }, [today]);

  const handleClockIn = async () => {
    await apiClient('/api/time-tracking/clock-in', { method: 'POST', body: {} }).catch((err) => alert(err.message));
    loadToday();
    loadEntries();
  };
  const handleClockOut = async () => {
    await apiClient('/api/time-tracking/clock-out', { method: 'POST' }).catch((err) => alert(err.message));
    loadToday();
    loadEntries();
  };

  const openManual = () => {
    setManualForm({ date: todayIso(), startTime: '07:00', endTime: '17:00', siteId: '' });
    setManualError(null);
    setManualOpen(true);
  };
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setManualSubmitting(true);
    try {
      await apiClient('/api/time-tracking/manual', {
        method: 'POST',
        body: { ...manualForm, siteId: manualForm.siteId || undefined },
      });
      setManualOpen(false);
      loadToday();
      loadEntries();
    } catch (err: any) {
      setManualError(err.message || 'Nie udało się zapisać wpisu.');
    } finally {
      setManualSubmitting(false);
    }
  };

  if (today === undefined || entries === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  const isOpen = today && !today.clockOut;
  const preview = previewMinutes(manualForm.startTime, manualForm.endTime);
  const totalMinutesAll = entries.reduce((sum, e) => sum + (e.totalMinutes ?? 0), 0);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Czas pracy</h1>
          <p className="text-sm text-zinc-500">Rejestracja dzisiejszego dnia pracy.</p>
        </div>
        <Button onClick={openManual} variant="outline" size="sm" className="border-zinc-700 text-zinc-300">
          <Plus className="mr-1 h-4 w-4" /> Dodaj ręcznie
        </Button>
      </div>

      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <div className="font-mono text-4xl font-bold text-zinc-100">{isOpen ? elapsed : today ? '✔' : '00:00:00'}</div>
        <p className="text-sm text-zinc-500">
          {isOpen
            ? `Rozpoczęto o ${new Date(today!.clockIn).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
            : today
              ? 'Dzisiejszy dzień zakończony'
              : 'Nie rozpoczęto dzisiejszej pracy'}
        </p>
        {isOpen ? (
          <Button onClick={handleClockOut} className="h-28 w-28 rounded-full bg-gradient-to-br from-red-600 to-red-900 text-sm font-bold text-white shadow-lg">
            Zakończ
          </Button>
        ) : !today ? (
          <Button onClick={handleClockIn} className="h-28 w-28 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-sm font-bold text-white shadow-lg">
            Rozpocznij
          </Button>
        ) : null}
      </div>

      {/* ---- HISTORIA WPISÓW ---- */}
      <div className="mx-auto mt-6 max-w-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">Twoje wpisy</h2>
          <p className="text-sm text-zinc-400">Łącznie: <span className="font-semibold text-orange-400">{formatHM(totalMinutesAll)}</span></p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">Brak wpisów.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm last:border-0">
                <div>
                  <p className="text-zinc-200">{new Date(e.date).toLocaleDateString('pl-PL')}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(e.clockIn).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {e.clockOut ? new Date(e.clockOut).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : 'trwa'}
                    {e.site?.name ? ` · ${e.site.name}` : ''}
                  </p>
                </div>
                <p className="font-semibold text-zinc-200">{e.totalMinutes != null ? formatHM(e.totalMinutes) : '—'}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ---- MODAL: RĘCZNY WPIS ---- */}
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Dodaj czas pracy ręcznie" description="Zaznacz zakres godzin, np. od 7:00 do 17:00.">
        <form onSubmit={handleManualSubmit}>
          <label className={labelClass}>Data</label>
          <input required type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} className={fieldClass} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Od godziny</label>
              <input required type="time" value={manualForm.startTime} onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Do godziny</label>
              <input required type="time" value={manualForm.endTime} onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })} className={fieldClass} />
            </div>
          </div>

          {sites.length > 0 && (
            <>
              <label className={labelClass}>Budowa (opcjonalnie)</label>
              <select value={manualForm.siteId} onChange={(e) => setManualForm({ ...manualForm, siteId: e.target.value })} className={fieldClass}>
                <option value="">— brak —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}

          <div className="mt-2 flex items-center gap-2 rounded-lg border border-orange-900/40 bg-orange-950/20 px-3 py-2 text-sm text-orange-300">
            <Clock className="h-4 w-4" />
            {preview != null ? <>Przepracowane: <strong>{formatHM(preview)}</strong></> : 'Godzina zakończenia musi być późniejsza niż rozpoczęcia'}
          </div>

          {manualError && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{manualError}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setManualOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={manualSubmitting || preview == null} className="bg-orange-600 text-white hover:bg-orange-500">
              {manualSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
