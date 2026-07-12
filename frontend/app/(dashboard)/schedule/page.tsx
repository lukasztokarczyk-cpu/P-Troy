'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Trash2, Coffee } from 'lucide-react';
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
  { value: 'LEAVE', label: 'Urlop / Wolne' },
  { value: 'TRAINING', label: 'Szkolenie' },
  { value: 'VEHICLE_INSPECTION', label: 'Przegląd pojazdu' },
  { value: 'MATERIAL_DELIVERY', label: 'Dostawa materiałów' },
  { value: 'OTHER', label: 'Inne' },
];

interface Installer { id: string; firstName: string; lastName: string; }

function toDateInput(iso: string) { return iso.slice(0, 10); }
function toTimeInput(iso: string) { return new Date(iso).toTimeString().slice(0, 5); }

export default function SchedulePage() {
  const { user, isPrivileged } = useAuth();
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null);
  const [installers, setInstallers] = useState<Installer[]>([]);

  // ---- Modal tworzenia/edycji ----
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', type: 'OTHER', date: '', startTime: '08:00', endTime: '16:00',
    description: '', installerIds: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);

  const loadEvents = useCallback(async () => {
    const isAdminOrLead = user?.role === 'ADMIN' || user?.role === 'KIEROWNIK';
    const [realEvents, refuelings] = await Promise.all([
      apiClient<ScheduleEvent[]>('/api/schedule/events').catch(() => []),
      apiClient<any[]>('/api/expenses/calendar/refuelings').catch(() => []),
    ]);

    // Tankowania są "wtapiane" do tej samej listy jako syntetyczne,
    // tylko-do-odczytu wydarzenia — bez dotykania prawdziwych ScheduleEvent
    const refuelingEvents: ScheduleEvent[] = refuelings.map((r) => ({
      id: r.id,
      title: r.title,
      type: 'REFUELING',
      priority: 'NORMAL',
      status: 'DONE',
      startDate: r.date,
      endDate: r.date,
      allDay: false,
      assignees: [{ user: { id: r.installerId, firstName: r.installerName.split(' ')[0], lastName: r.installerName.split(' ')[1] || '' } }],
      readOnly: true,
    }));

    setEvents([...realEvents, ...refuelingEvents]);
  }, [user]);

  useEffect(() => { if (user) loadEvents(); }, [user, loadEvents]);

  useEffect(() => {
    if (isPrivileged) {
      apiClient<Installer[]>('/api/users/installers').then(setInstallers).catch(() => setInstallers([]));
    }
  }, [isPrivileged]);

  const handleEventMove = async (eventId: string, startDate: Date, endDate: Date) => {
    if (eventId.startsWith('refueling-')) return; // tankowania nie da się przesuwać
    await apiClient(`/api/schedule/events/${eventId}/move`, {
      method: 'PATCH',
      body: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    }).catch(() => undefined);
    loadEvents();
  };

  const openCreateModal = (date: Date) => {
    setEditingId(null);
    setForm({
      title: '', type: 'OTHER', date: date.toISOString().slice(0, 10),
      startTime: '08:00', endTime: '16:00', description: '',
      installerIds: user ? [user.id] : [],
    });
    setModalOpen(true);
  };

  // Klik w wydarzenie: tankowanie -> tylko informacja; reszta -> edycja
  // (podgląd dla instalatora, pełna edycja dla admina/kierownika)
  const handleEventClick = (event: ScheduleEvent) => {
    if (event.readOnly) {
      alert(`${event.title}\n${event.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(', ')}\n${new Date(event.startDate).toLocaleString('pl-PL')}`);
      return;
    }
    setEditingId(event.id);
    setForm({
      title: event.title,
      type: event.type,
      date: toDateInput(event.startDate),
      startTime: toTimeInput(event.startDate),
      endTime: toTimeInput(event.endDate),
      description: event.description || '',
      installerIds: event.assignees.map((a) => a.user.id),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const startDate = new Date(`${form.date}T${form.startTime}:00`).toISOString();
      const endDate = new Date(`${form.date}T${form.endTime}:00`).toISOString();
      const body = {
        title: form.title,
        type: form.type,
        description: form.description || undefined,
        startDate,
        endDate,
        assigneeIds: isPrivileged ? form.installerIds : [user!.id],
      };

      if (editingId) {
        await apiClient(`/api/schedule/events/${editingId}`, { method: 'PATCH', body });
      } else {
        await apiClient('/api/schedule/events', { method: 'POST', body });
      }
      setModalOpen(false);
      loadEvents();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || !window.confirm('Usunąć to wydarzenie?')) return;
    setSubmitting(true);
    try {
      await apiClient(`/api/schedule/events/${editingId}`, { method: 'DELETE' });
      setModalOpen(false);
      loadEvents();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // "Instalator może oznaczyć status Wolne" — szybkie utworzenie
  // całodniowej przerwy (typ LEAVE) na dziś, wyłącznie dla siebie
  const handleMarkDayOff = async () => {
    if (!user) return;
    const date = window.prompt('Na jaki dzień oznaczyć „Wolne"? (RRRR-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!date) return;
    setSubmitting(true);
    try {
      await apiClient('/api/schedule/events', {
        method: 'POST',
        body: {
          title: 'Wolne',
          type: 'LEAVE',
          startDate: new Date(`${date}T00:00:00`).toISOString(),
          endDate: new Date(`${date}T23:59:59`).toISOString(),
          allDay: true,
          assigneeIds: [user.id],
        },
      });
      loadEvents();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const viewOnly = !!editingId && !isPrivileged;

  const toggleInstaller = (id: string) => {
    setForm((f) => ({
      ...f,
      installerIds: f.installerIds.includes(id) ? f.installerIds.filter((i) => i !== id) : [...f.installerIds, id],
    }));
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
      {user.role === 'INSTALATOR' && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={handleMarkDayOff} className="border-zinc-700 text-zinc-300">
            <Coffee className="mr-1.5 h-3.5 w-3.5" /> Oznacz Wolne
          </Button>
        </div>
      )}

      <ScheduleCalendar
        events={events}
        currentUserId={user.id}
        isPrivileged={isPrivileged}
        onEventMove={handleEventMove}
        onEventClick={handleEventClick}
        onCreateEvent={openCreateModal}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? (viewOnly ? 'Szczegóły wydarzenia' : 'Wydarzenie') : 'Nowe wydarzenie'} maxWidth="max-w-lg">
        <form onSubmit={handleSubmit}>
          <fieldset disabled={viewOnly} className={viewOnly ? 'opacity-80' : ''}>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Godzina rozpoczęcia</label>
                <input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Godzina zakończenia</label>
                <input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={fieldClass} />
              </div>
            </div>

            {(isPrivileged || viewOnly) && (
              <>
                <label className={labelClass}>Instalatorzy</label>
                <div className="max-h-32 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-2">
                  {isPrivileged ? (
                    <>
                      {installers.length === 0 && <p className="text-xs text-zinc-600">Brak instalatorów w systemie.</p>}
                      {installers.map((i) => (
                        <label key={i.id} className="flex items-center gap-2 py-1 text-sm text-zinc-200">
                          <input type="checkbox" checked={form.installerIds.includes(i.id)} onChange={() => toggleInstaller(i.id)} className="accent-orange-600" />
                          {i.firstName} {i.lastName}
                        </label>
                      ))}
                    </>
                  ) : (
                    <p className="text-sm text-zinc-300">Ty</p>
                  )}
                </div>
              </>
            )}

            <label className={labelClass}>Opis (opcjonalnie)</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Szczegóły wydarzenia..." className={fieldClass} />
          </fieldset>

          <div className="mt-5 flex items-center justify-between">
            {editingId && isPrivileged ? (
              <button type="button" onClick={handleDelete} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                <Trash2 className="h-3.5 w-3.5" /> Usuń
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">
                {viewOnly ? 'Zamknij' : 'Anuluj'}
              </Button>
              {!viewOnly && (
                <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
                  {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
                </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
