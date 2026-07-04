'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

interface TimeEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
}

export default function TimeTrackingPage() {
  const [today, setToday] = useState<TimeEntry | null | undefined>(undefined);
  const [elapsed, setElapsed] = useState('00:00:00');

  const loadToday = useCallback(() => {
    apiClient<TimeEntry | null>('/api/time-tracking/today').then(setToday).catch(() => setToday(null));
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

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
  };
  const handleClockOut = async () => {
    await apiClient('/api/time-tracking/clock-out', { method: 'POST' }).catch((err) => alert(err.message));
    loadToday();
  };

  if (today === undefined) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  const isOpen = today && !today.clockOut;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Czas pracy</h1>
        <p className="text-sm text-zinc-500">Rejestracja dzisiejszego dnia pracy.</p>
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
    </div>
  );
}
