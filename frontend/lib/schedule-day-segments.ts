import { ScheduleEvent, ScheduleEventType } from './schedule-types';

export interface DaySegment {
  kind: 'WORK' | 'EVENT';
  type?: ScheduleEventType; // tylko gdy kind === 'EVENT'
  start: Date;
  end: Date;
  event?: ScheduleEvent;
}

// Typy, które faktycznie "zajmują" czas w harmonogramie i mogą wyciąć
// (rozdzielić) inny, trwający w tle blok — z priorytetem: budowa jest
// tłem, zadanie/dostawa mogą ją przerwać, awaria ma jeszcze wyższy
// priorytet, a przerwa zawsze wygrywa (nigdy nie jest czasem pracy).
const PAINT_PRIORITY: Partial<Record<ScheduleEventType, number>> = {
  CONSTRUCTION: 0,
  TASK: 1,
  MATERIAL_DELIVERY: 1,
  FAILURE: 2,
  BREAK: 3,
};
// Typy dokładające domyślny czas pracy 07:00–17:00, jeśli instalator
// nic ręcznie nie ustawił (sekcja 5: "jeżeli ma przypisaną budowę...")
const WORK_TRIGGER_TYPES: ScheduleEventType[] = ['CONSTRUCTION', 'TASK', 'FAILURE', 'MATERIAL_DELIVERY'];
// Wydarzenia pokazywane osobno, ale NIE wliczane do czasu pracy i NIE
// przerywające bloku budowy/pracy (np. urlop, szkolenie danego dnia
// obok czegoś innego — rzadkie, ale nie powinno psuć segmentacji)
const PASSTHROUGH_TYPES: ScheduleEventType[] = ['LEAVE', 'TRIP', 'MEASUREMENT', 'TRAINING', 'VEHICLE_INSPECTION', 'OTHER', 'REFUELING'];

function atTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Liczy segmenty dnia dla jednego instalatora — dokładnie wg scenariuszy
 * z sekcji 6, 9, 10, 28, 29 specyfikacji: budowa jako tło, awaria/zadanie/
 * dostawa "wycinają" z niej kawałek (bez podwójnego naliczania), przerwa
 * nigdy nie liczy się jako czas pracy. Jeśli instalator nie ma tego dnia
 * żadnej budowy/zadania/awarii, NIE wymyślamy czasu pracy (sekcja 5).
 */
export function computeDaySegments(
  dayEvents: ScheduleEvent[],
  anchor: Date,
  defaultStart = '07:00',
  defaultEnd = '17:00',
): { segments: DaySegment[]; totalWorkMinutes: number; hasAutoWindow: boolean } {
  const hasTrigger = dayEvents.some((e) => WORK_TRIGGER_TYPES.includes(e.type));

  if (!hasTrigger) {
    const segments = dayEvents
      .map((e) => ({ kind: 'EVENT' as const, type: e.type, start: new Date(e.startDate), end: new Date(e.endDate), event: e }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return { segments, totalWorkMinutes: 0, hasAutoWindow: false };
  }

  const paintable = dayEvents.filter((e) => e.type in PAINT_PRIORITY);

  let windowStart = atTime(anchor, defaultStart);
  let windowEnd = atTime(anchor, defaultEnd);
  for (const e of paintable) {
    const s = new Date(e.startDate);
    const en = new Date(e.endDate);
    if (s < windowStart) windowStart = s;
    if (en > windowEnd) windowEnd = en;
  }

  let segments: DaySegment[] = [{ kind: 'WORK', start: windowStart, end: windowEnd }];

  const sorted = [...paintable].sort((a, b) => (PAINT_PRIORITY[a.type] ?? 0) - (PAINT_PRIORITY[b.type] ?? 0));
  for (const e of sorted) {
    const s = new Date(e.startDate);
    const en = new Date(e.endDate);
    const next: DaySegment[] = [];
    for (const seg of segments) {
      // brak nachodzenia — zostaw bez zmian
      if (en <= seg.start || s >= seg.end) { next.push(seg); continue; }
      if (seg.start < s) next.push({ ...seg, end: s });
      if (seg.end > en) next.push({ ...seg, start: en });
    }
    next.push({ kind: 'EVENT', type: e.type, start: s, end: en, event: e });
    segments = next;
  }

  for (const e of dayEvents.filter((e) => PASSTHROUGH_TYPES.includes(e.type))) {
    segments.push({ kind: 'EVENT', type: e.type, start: new Date(e.startDate), end: new Date(e.endDate), event: e });
  }
  segments.sort((a, b) => a.start.getTime() - b.start.getTime());

  const totalWorkMinutes = segments
    .filter((s) => s.kind === 'WORK' || (s.kind === 'EVENT' && s.type !== 'BREAK' && !PASSTHROUGH_TYPES.includes(s.type!)))
    .reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()) / 60000, 0);

  return { segments, totalWorkMinutes, hasAutoWindow: true };
}
