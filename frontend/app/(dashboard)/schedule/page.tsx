'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { ScheduleCalendar } from '@/components/schedule/ScheduleCalendar';
import { ScheduleEvent } from '@/lib/schedule-types';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

const TYPE_OPTIONS = [
  { value: 'CONSTRUCTION', label: 'Budowa' },
  { value: 'TRIP', label: 'Wyjazd' },
  { value: 'MEASUREMENT', label: 'Pomiar' },
  { value: 'LEAVE', label: 'Urlop' },
  { value: 'TRAINING', label: 'Szkolenie' },
  { value: 'VEHICLE_INSPECTION', label: 'Przegląd pojazdu' },
  { value: 'MATERIAL_DELIVERY', label: 'Dostawa materiałów' },
  { value: 'OTHER', label: 'Inne' },
];

export default function SchedulePage() {
  const { user, isPrivileged } = useAuth();
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'OTHER', date: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadEvents = useCallback(() => {
    apiClient<ScheduleEvent[]>('/api/schedule/events')
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleEventMove = async (eventId: string, startDate: Date, endDate: Date) => {
    await apiClient(`/api/schedule/events/${eventId}/move`, {
      method: 'PATCH',
      body: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    }).catch(() => undefined);
    loadEvents();
  };

  const openCreateModal = (date: Date) => {
    setForm({ title: '', type: 'OTHER', date: date.toISOString().slice(0, 10), description: '' });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const iso = new Date(form.date).toISOString();
      await apiClient('/api/schedule/events', {
        method: 'POST',
        body: {
          title: form.title,
          type: form.type,
          description: form.description || undefined,
          startDate: iso,
          endDate: iso,
          assigneeIds: user ? [user.id] : [],
        },
      });
      setModalOpen(false);
      loadEvents();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || events === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-160px)] animate-fade-in">
      <ScheduleCalendar
        events={events}
        currentUserId={user.id}
        isPrivileged={isPrivileged}
        onEventMove={handleEventMove}
        onCreateEvent={openCreateModal}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowe wydarzenie">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Nazwa</label>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="np. Montaż rozdzielnicy" className={fieldClass} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Typ</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={fieldClass}>
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Data</label>
              <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <label className={labelClass}>Opis (opcjonalnie)</label>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Szczegóły wydarzenia..." className={fieldClass} />

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
