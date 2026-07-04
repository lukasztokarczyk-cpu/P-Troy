'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { ScheduleCalendar } from '@/components/schedule/ScheduleCalendar';
import { ScheduleEvent } from '@/lib/schedule-types';

export default function SchedulePage() {
  const { user, isPrivileged } = useAuth();
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null);

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

  const handleCreateEvent = async (date: Date) => {
    const title = window.prompt('Nazwa wydarzenia:');
    if (!title) return;
    await apiClient('/api/schedule/events', {
      method: 'POST',
      body: {
        title,
        type: 'OTHER',
        startDate: date.toISOString(),
        endDate: date.toISOString(),
        assigneeIds: user ? [user.id] : [],
      },
    }).catch((err) => alert(err.message));
    loadEvents();
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
        onCreateEvent={handleCreateEvent}
      />
    </div>
  );
}
