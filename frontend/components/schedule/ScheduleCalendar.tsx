'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  CalendarDays,
  Calendar as CalendarIcon,
  MapPin,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScheduleEvent, EVENT_TYPE_META } from '@/lib/schedule-types';

type ViewMode = 'day' | 'week' | 'month' | 'year';

interface ScheduleCalendarProps {
  events: ScheduleEvent[];
  currentUserId: string;
  isPrivileged: boolean; // Administrator / Brygadzista — pełny widok + edycja
  onEventMove?: (eventId: string, startDate: Date, endDate: Date) => void;
  onEventClick?: (event: ScheduleEvent) => void;
  onCreateEvent?: (date: Date) => void;
}

const WEEKDAYS_PL = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
const MONTHS_PL = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // poniedziałek = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildMonthGrid(anchor: Date) {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function ScheduleCalendar({
  events,
  currentUserId,
  isPrivileged,
  onEventMove,
  onEventClick,
  onCreateEvent,
}: ScheduleCalendarProps) {
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => (filterPriority === 'ALL' ? true : e.priority === filterPriority)),
    [events, filterPriority],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const ev of filteredEvents) {
      const key = new Date(ev.startDate).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [filteredEvents]);

  const navigate = useCallback(
    (dir: -1 | 1) => {
      const d = new Date(anchor);
      if (view === 'day') d.setDate(d.getDate() + dir);
      if (view === 'week') d.setDate(d.getDate() + dir * 7);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      if (view === 'year') d.setFullYear(d.getFullYear() + dir);
      setAnchor(d);
    },
    [anchor, view],
  );

  const handleDrop = (day: Date) => {
    if (!draggedId) return;
    const ev = filteredEvents.find((e) => e.id === draggedId);
    if (!ev) return;
    const duration = new Date(ev.endDate).getTime() - new Date(ev.startDate).getTime();
    const newStart = new Date(day);
    newStart.setHours(new Date(ev.startDate).getHours(), new Date(ev.startDate).getMinutes());
    const newEnd = new Date(newStart.getTime() + duration);
    onEventMove?.(draggedId, newStart, newEnd);
    setDraggedId(null);
  };

  const headerLabel = useMemo(() => {
    if (view === 'year') return String(anchor.getFullYear());
    if (view === 'month') return `${MONTHS_PL[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (view === 'week') {
      const start = startOfWeek(anchor);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.getDate()} - ${end.getDate()} ${MONTHS_PL[end.getMonth()]} ${end.getFullYear()}`;
    }
    return anchor.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [anchor, view]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100">
      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold tracking-tight">Harmonogram</h2>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-zinc-400 hover:text-orange-500">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[180px] text-center text-sm font-medium text-zinc-200">{headerLabel}</span>
          <Button variant="ghost" size="icon" onClick={() => navigate(1)} className="text-zinc-400 hover:text-orange-500">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())} className="border-zinc-700 text-zinc-300">
            Dziś
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <SelectTrigger className="w-[130px] border-zinc-700 bg-zinc-900 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
              <SelectItem value="day">Dzień</SelectItem>
              <SelectItem value="week">Tydzień</SelectItem>
              <SelectItem value="month">Miesiąc</SelectItem>
              <SelectItem value="year">Rok</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[150px] border-zinc-700 bg-zinc-900 text-zinc-200">
              <Filter className="mr-1 h-3.5 w-3.5 text-zinc-400" />
              <SelectValue placeholder="Priorytet" />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
              <SelectItem value="ALL">Wszystkie priorytety</SelectItem>
              <SelectItem value="LOW">Niski</SelectItem>
              <SelectItem value="NORMAL">Normalny</SelectItem>
              <SelectItem value="HIGH">Wysoki</SelectItem>
              <SelectItem value="CRITICAL">Krytyczny</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={() => onCreateEvent?.(anchor)}
            className="bg-orange-600 text-white hover:bg-orange-500"
          >
            <Plus className="mr-1 h-4 w-4" /> Dodaj wydarzenie
          </Button>
        </div>
      </div>

      {/* Widoki */}
      <div className="flex-1 overflow-auto p-4">
        <AnimatePresence mode="wait">
          {view === 'month' && (
            <MonthView
              key="month"
              anchor={anchor}
              eventsByDay={eventsByDay}
              onDrop={handleDrop}
              onDragStart={setDraggedId}
              onEventClick={onEventClick}
              onCreateEvent={onCreateEvent}
              isPrivileged={isPrivileged}
            />
          )}
          {view === 'week' && (
            <WeekView key="week" anchor={anchor} eventsByDay={eventsByDay} onEventClick={onEventClick} onCreateEvent={onCreateEvent} />
          )}
          {view === 'day' && (
            <DayView key="day" anchor={anchor} eventsByDay={eventsByDay} onEventClick={onEventClick} onCreateEvent={onCreateEvent} />
          )}
          {view === 'year' && (
            <YearView key="year" anchor={anchor} eventsByDay={eventsByDay} onSelectDay={(d) => { setAnchor(d); setView('day'); }} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Widok Miesiąc — siatka 6x7 z obsługą Drag & Drop
// ---------------------------------------------------------------------
function MonthView({
  anchor,
  eventsByDay,
  onDrop,
  onDragStart,
  onEventClick,
  onCreateEvent,
  isPrivileged,
}: {
  anchor: Date;
  eventsByDay: Map<string, ScheduleEvent[]>;
  onDrop: (day: Date) => void;
  onDragStart: (id: string) => void;
  onEventClick?: (e: ScheduleEvent) => void;
  onCreateEvent?: (date: Date) => void;
  isPrivileged: boolean;
}) {
  const days = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const today = new Date();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
      {WEEKDAYS_PL.map((w) => (
        <div key={w} className="bg-zinc-900 px-2 py-1.5 text-center text-xs font-medium text-zinc-500">
          {w}
        </div>
      ))}
      {days.map((day) => {
        const inMonth = day.getMonth() === anchor.getMonth();
        const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
        return (
          <div
            key={day.toISOString()}
            onDragOver={(e) => isPrivileged && e.preventDefault()}
            onDrop={() => isPrivileged && onDrop(day)}
            onClick={(e) => {
              if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'SPAN') {
                onCreateEvent?.(day);
              }
            }}
            className={`min-h-[100px] cursor-pointer bg-zinc-950 p-1.5 transition-colors hover:bg-zinc-900/60 ${
              inMonth ? '' : 'opacity-40'
            } ${isSameDay(day, today) ? 'ring-1 ring-inset ring-orange-500/60' : ''}`}
          >
            <span className={`text-xs ${isSameDay(day, today) ? 'font-bold text-orange-500' : 'text-zinc-500'}`}>
              {day.getDate()}
            </span>
            <div className="mt-1 flex flex-col gap-1">
              {dayEvents.slice(0, 3).map((ev) => (
                <motion.button
                  key={ev.id}
                  draggable={isPrivileged && !ev.readOnly}
                  onDragStart={(e) => { e.stopPropagation(); onDragStart(ev.id); }}
                  onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
                  whileHover={{ scale: 1.02 }}
                  className={`truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white shadow-sm ${ev.readOnly ? 'opacity-80' : ''}`}
                  style={{ backgroundColor: `${EVENT_TYPE_META[ev.type].color}CC` }}
                  title={ev.title}
                >
                  {!ev.allDay && (
                    <span className="mr-1 font-normal opacity-80">
                      {new Date(ev.startDate).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {ev.title}
                </motion.button>
              ))}
              {dayEvents.length > 3 && (
                <span className="text-[10px] text-zinc-500">+{dayEvents.length - 3} więcej</span>
              )}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// Widok Tydzień — kolumny dni z listą wydarzeń
// ---------------------------------------------------------------------
function WeekView({
  anchor,
  eventsByDay,
  onEventClick,
  onCreateEvent,
}: {
  anchor: Date;
  eventsByDay: Map<string, ScheduleEvent[]>;
  onEventClick?: (e: ScheduleEvent) => void;
  onCreateEvent?: (date: Date) => void;
}) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-7 gap-2">
      {days.map((day) => (
        <div
          key={day.toISOString()}
          onClick={(e) => { if (e.target === e.currentTarget) onCreateEvent?.(day); }}
          className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-2 transition-colors hover:border-orange-600/30"
        >
          <div className="mb-2 text-xs font-medium text-zinc-400">
            {WEEKDAYS_PL[(day.getDay() + 6) % 7]} <span className="text-orange-500">{day.getDate()}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {(eventsByDay.get(day.toDateString()) ?? []).map((ev) => (
              <EventCard key={ev.id} event={ev} onClick={() => onEventClick?.(ev)} />
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// Widok Dzień — chronologiczna lista wydarzeń danego dnia
// ---------------------------------------------------------------------
function DayView({
  anchor,
  eventsByDay,
  onEventClick,
  onCreateEvent,
}: {
  anchor: Date;
  eventsByDay: Map<string, ScheduleEvent[]>;
  onEventClick?: (e: ScheduleEvent) => void;
  onCreateEvent?: (date: Date) => void;
}) {
  const dayEvents = (eventsByDay.get(anchor.toDateString()) ?? []).sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
      {dayEvents.length === 0 && (
        <button onClick={() => onCreateEvent?.(anchor)} className="w-full rounded-lg border border-dashed border-zinc-700 py-12 text-center text-sm text-zinc-500 transition-colors hover:border-orange-600/50 hover:text-orange-400">
          Brak wydarzeń tego dnia — kliknij, aby dodać.
        </button>
      )}
      {dayEvents.map((ev) => (
        <div key={ev.id} onClick={() => onEventClick?.(ev)} className={`cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-orange-600/50 ${ev.readOnly ? 'opacity-80' : ''}`}>
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-100">{ev.title}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: EVENT_TYPE_META[ev.type].color }}
            >
              {EVENT_TYPE_META[ev.type].label}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>
              {new Date(ev.startDate).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} –{' '}
              {new Date(ev.endDate).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {ev.location && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.location}</span>
            )}
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {ev.assignees.length}</span>
          </div>
        </div>
      ))}
      {dayEvents.length > 0 && (
        <button onClick={() => onCreateEvent?.(anchor)} className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-center text-xs text-zinc-500 transition-colors hover:border-orange-600/50 hover:text-orange-400">
          + Dodaj kolejne wydarzenie tego dnia
        </button>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------
// Widok Rok — 12 mini-kalendarzy z gęstością wydarzeń (heatmapa)
// ---------------------------------------------------------------------
function YearView({
  anchor,
  eventsByDay,
  onSelectDay,
}: {
  anchor: Date;
  eventsByDay: Map<string, ScheduleEvent[]>;
  onSelectDay: (d: Date) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {MONTHS_PL.map((m, monthIdx) => {
        const monthAnchor = new Date(anchor.getFullYear(), monthIdx, 1);
        const days = buildMonthGrid(monthAnchor).filter((d) => d.getMonth() === monthIdx);
        return (
          <div key={m} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <h4 className="mb-2 text-xs font-semibold text-zinc-300">{m}</h4>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((d) => {
                const count = (eventsByDay.get(d.toDateString()) ?? []).length;
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => onSelectDay(d)}
                    className="aspect-square rounded-sm text-[9px] text-zinc-500 transition-colors hover:ring-1 hover:ring-orange-500"
                    style={{
                      backgroundColor: count > 0 ? `rgba(249,115,22,${Math.min(0.15 * count + 0.15, 0.9)})` : 'transparent',
                    }}
                    title={`${d.getDate()} — ${count} wydarzeń`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

function EventCard({ event, onClick }: { event: ScheduleEvent; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2 py-1.5 text-left text-xs font-medium text-white shadow-sm transition-transform hover:scale-[1.02]"
      style={{ backgroundColor: `${EVENT_TYPE_META[event.type].color}CC` }}
    >
      {!event.allDay && (
        <span className="mr-1 font-normal opacity-80">
          {new Date(event.startDate).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      {event.title}
    </button>
  );
}
