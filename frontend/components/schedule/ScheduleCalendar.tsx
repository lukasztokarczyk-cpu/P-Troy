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
import { ScheduleEvent, ScheduleEventType, EVENT_TYPE_META, FALLBACK_COLOR } from '@/lib/schedule-types';
import * as Icons from 'lucide-react';

// Kolor aktywności = kolor PROFILU instalatora (pierwszy przypisany),
// a nie typu aktywności — patrz sekcja 17 specyfikacji: "pomarańczowy
// zawsze = Jan", niezależnie czy to budowa, awaria czy zadanie. Typ
// rozróżniamy ikoną (TypeIcon poniżej), nie kolorem.
function eventColor(ev: ScheduleEvent): string {
  return ev.assignees.find((a) => a.user.color)?.user.color || EVENT_TYPE_META[ev.type].color;
}

function TypeIcon({ type, className }: { type: ScheduleEventType; className?: string }) {
  const Icon = (Icons as any)[EVENT_TYPE_META[type].icon] || Icons.Calendar;
  return <Icon className={className} />;
}

type ViewMode = 'day' | 'week' | 'month' | 'year';

interface ScheduleCalendarProps {
  events: ScheduleEvent[];
  currentUserId: string;
  isPrivileged: boolean; // Administrator / Brygadzista — pełny widok + edycja
  installers?: { id: string; firstName: string; lastName: string; color: string | null }[];
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
  installers = [],
  onEventMove,
  onEventClick,
  onCreateEvent,
}: ScheduleCalendarProps) {
  // Domyślnie zawsze otwieramy DZISIAJ (sekcja 1 specyfikacji) — dla
  // każdej roli, nie tylko instalatora.
  const [view, setView] = useState<ViewMode>('day');
  const [daySpan, setDaySpan] = useState(1); // widok "2 dni" / własny zakres = N kolejnych dni
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [anchor, setAnchor] = useState(new Date());
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // "Mój harmonogram" / "Harmonogram zespołu" — tylko dla admina/brygadzisty,
  // instalator zawsze widzi tylko siebie (sekcja 14, 33)
  const [scope, setScope] = useState<'mine' | 'team'>(isPrivileged ? 'team' : 'mine');
  const [filterInstallerId, setFilterInstallerId] = useState<string | null>(null);

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => {
        if (filterPriority !== 'ALL' && e.priority !== filterPriority) return false;
        if (!isPrivileged || scope === 'mine') {
          return e.assignees.some((a) => a.user.id === currentUserId);
        }
        if (filterInstallerId) {
          return e.assignees.some((a) => a.user.id === filterInstallerId);
        }
        return true;
      }),
    [events, filterPriority, scope, filterInstallerId, isPrivileged, currentUserId],
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

  const applyPreset = useCallback((preset: 'today' | 'tomorrow' | 'twoDays' | 'week' | 'nextWeek' | 'month') => {
    const today = new Date();
    if (preset === 'today') { setView('day'); setDaySpan(1); setAnchor(today); }
    if (preset === 'tomorrow') { const d = new Date(today); d.setDate(d.getDate() + 1); setView('day'); setDaySpan(1); setAnchor(d); }
    if (preset === 'twoDays') { setView('day'); setDaySpan(2); setAnchor(today); }
    if (preset === 'week') { setView('week'); setDaySpan(1); setAnchor(today); }
    if (preset === 'nextWeek') { const d = new Date(today); d.setDate(d.getDate() + 7); setView('week'); setDaySpan(1); setAnchor(d); }
    if (preset === 'month') { setView('month'); setDaySpan(1); setAnchor(today); }
    setShowRangePicker(false);
  }, []);

  const applyCustomRange = useCallback((start: string, end: string) => {
    if (!start || !end) return;
    const s = new Date(start);
    const e = new Date(end);
    const days = Math.max(1, Math.min(31, Math.round((e.getTime() - s.getTime()) / 86400000) + 1));
    setView('day');
    setDaySpan(days);
    setAnchor(s);
    setShowRangePicker(false);
  }, []);

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

      {/* Drugi pasek: szybkie zakresy + mój/zespołu + legenda instalatorów */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/60 px-4 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {([
            ['today', 'Dzisiaj'], ['tomorrow', 'Jutro'], ['twoDays', '2 dni'],
            ['week', 'Ten tydzień'], ['nextWeek', 'Następny tydzień'], ['month', 'Ten miesiąc'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-orange-600/60 hover:text-orange-400"
            >
              {label}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowRangePicker((v) => !v)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${showRangePicker ? 'border-orange-600 text-orange-400' : 'border-zinc-700 text-zinc-400 hover:border-orange-600/60 hover:text-orange-400'}`}
            >
              Własny zakres
            </button>
            {showRangePicker && (
              <RangePickerPopover onApply={applyCustomRange} />
            )}
          </div>
        </div>

        {isPrivileged && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-zinc-700 p-0.5 text-xs">
              <button
                onClick={() => { setScope('mine'); setFilterInstallerId(null); }}
                className={`rounded px-2.5 py-1 transition-colors ${scope === 'mine' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Mój harmonogram
              </button>
              <button
                onClick={() => setScope('team')}
                className={`rounded px-2.5 py-1 transition-colors ${scope === 'team' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Harmonogram zespołu
              </button>
            </div>

            {scope === 'team' && installers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setFilterInstallerId(null)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${!filterInstallerId ? 'border-orange-600 text-orange-400' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                >
                  Wszyscy
                </button>
                {installers.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => setFilterInstallerId(filterInstallerId === inst.id ? null : inst.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${filterInstallerId === inst.id ? 'border-orange-600 text-white' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: inst.color || FALLBACK_COLOR }} />
                    {inst.firstName} {inst.lastName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* "Kto dziś pracuje" — szybki podgląd zespołu (sekcja 31), tylko
          administrator, widok dnia, zakres zespołu */}
      {isPrivileged && scope === 'team' && view === 'day' && daySpan === 1 && isSameDay(anchor, new Date()) && installers.length > 0 && (
        <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-2.5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Kto dziś pracuje</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-300">
            {installers.map((inst) => {
              const todays = (eventsByDay.get(anchor.toDateString()) || []).filter((e) => e.assignees.some((a) => a.user.id === inst.id));
              const primary = todays[0];
              return (
                <span key={inst.id} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: inst.color || FALLBACK_COLOR }} />
                  <span className="font-medium">{inst.firstName} {inst.lastName}</span>
                  {primary ? (
                    <span className="text-zinc-500">
                      — {new Date(primary.startDate).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}–{new Date(primary.endDate).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} {EVENT_TYPE_META[primary.type].label}
                      {todays.length > 1 ? ` (+${todays.length - 1})` : ''}
                    </span>
                  ) : (
                    <span className="text-zinc-600">— brak aktywności</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

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
          {view === 'day' && daySpan === 1 && (
            <DayView key="day" anchor={anchor} eventsByDay={eventsByDay} onEventClick={onEventClick} onCreateEvent={onCreateEvent} />
          )}
          {view === 'day' && daySpan > 1 && (
            <div key="multiDay" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: daySpan }, (_, offset) => {
                const d = new Date(anchor);
                d.setDate(d.getDate() + offset);
                return (
                  <div key={offset}>
                    <p className="mb-2 text-sm font-medium text-zinc-300">{d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <DayView anchor={d} eventsByDay={eventsByDay} onEventClick={onEventClick} onCreateEvent={onCreateEvent} />
                  </div>
                );
              })}
            </div>
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
                  className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white shadow-sm ${ev.readOnly ? 'opacity-80' : ''}`}
                  style={{ backgroundColor: `${eventColor(ev)}CC` }}
                  title={ev.title}
                >
                  <TypeIcon type={ev.type} className="h-2.5 w-2.5 shrink-0 opacity-90" />
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
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: eventColor(ev) }}
            >
              <TypeIcon type={ev.type} className="h-3 w-3" />
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
            {ev.assignees.length > 0 && (
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {ev.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(', ')}</span>
            )}
          </div>
          {ev.conflicts && ev.conflicts.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1 rounded bg-red-950/50 px-2 py-1 text-[11px] text-red-400">
              <Icons.AlertTriangle className="h-3 w-3 shrink-0" /> Konflikt: nakłada się z "{ev.conflicts[0].title}"
            </div>
          )}
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

function RangePickerPopover({ onApply }: { onApply: (start: string, end: string) => void }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  return (
    <div className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
      <label className="mb-1 block text-[11px] text-zinc-400">Od</label>
      <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200" />
      <label className="mb-1 block text-[11px] text-zinc-400">Do</label>
      <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mb-3 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200" />
      <button
        onClick={() => onApply(start, end)}
        disabled={!start || !end}
        className="w-full rounded bg-orange-600 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        Zastosuj
      </button>
    </div>
  );
}

function EventCard({ event, onClick }: { event: ScheduleEvent; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-medium text-white shadow-sm transition-transform hover:scale-[1.02]"
      style={{ backgroundColor: `${eventColor(event)}CC` }}
    >
      <TypeIcon type={event.type} className="h-3 w-3 shrink-0 opacity-90" />
      {!event.allDay && (
        <span className="mr-1 font-normal opacity-80">
          {new Date(event.startDate).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      {event.title}
    </button>
  );
}
