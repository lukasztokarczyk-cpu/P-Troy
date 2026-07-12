export type ScheduleEventType =
  | 'CONSTRUCTION'
  | 'TRIP'
  | 'MEASUREMENT'
  | 'LEAVE'
  | 'TRAINING'
  | 'VEHICLE_INSPECTION'
  | 'MATERIAL_DELIVERY'
  | 'TASK'
  | 'REFUELING'
  | 'OTHER';

export type SchedulePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type ScheduleStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'POSTPONED';

export interface ScheduleEvent {
  id: string;
  title: string;
  description?: string;
  type: ScheduleEventType;
  priority: SchedulePriority;
  status: ScheduleStatus;
  startDate: string; // ISO
  endDate: string; // ISO
  allDay: boolean;
  location?: string;
  site?: { id: string; name: string };
  vehicle?: { id: string; registrationNumber: string };
  assignees: { user: { id: string; firstName: string; lastName: string; avatarUrl?: string } }[];
  // Tankowania z modułu Wydatki są wtapiane do tej samej listy jako
  // "syntetyczne" wydarzenia tylko do odczytu (nie da się ich edytować
  // ani przesuwać) — ta flaga odróżnia je od prawdziwych ScheduleEvent
  readOnly?: boolean;
}

// Kolory i etykiety per typ wydarzenia — spójne z motywem: grafit/antracyt
// + jeden akcent pomarańczowy zarezerwowany dla priorytetu/aktywnego stanu
export const EVENT_TYPE_META: Record<ScheduleEventType, { label: string; color: string }> = {
  CONSTRUCTION: { label: 'Budowa', color: '#f97316' },
  TRIP: { label: 'Wyjazd', color: '#38bdf8' },
  MEASUREMENT: { label: 'Pomiar', color: '#a78bfa' },
  LEAVE: { label: 'Urlop / Wolne', color: '#4ade80' },
  TRAINING: { label: 'Szkolenie', color: '#facc15' },
  VEHICLE_INSPECTION: { label: 'Przegląd pojazdu', color: '#f87171' },
  MATERIAL_DELIVERY: { label: 'Dostawa materiałów', color: '#2dd4bf' },
  TASK: { label: 'Zadanie', color: '#94a3b8' },
  REFUELING: { label: 'Tankowanie', color: '#eab308' },
  OTHER: { label: 'Inne', color: '#64748b' },
};
