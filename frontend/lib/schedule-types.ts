export type ScheduleEventType =
  | 'CONSTRUCTION'
  | 'TRIP'
  | 'MEASUREMENT'
  | 'LEAVE'
  | 'TRAINING'
  | 'VEHICLE_INSPECTION'
  | 'MATERIAL_DELIVERY'
  | 'TASK'
  | 'FAILURE'
  | 'BREAK'
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
  assignees: { user: { id: string; firstName: string; lastName: string; avatarUrl?: string; color?: string | null } }[];
  // Tankowania z modułu Wydatki są wtapiane do tej samej listy jako
  // "syntetyczne" wydarzenia tylko do odczytu (nie da się ich edytować
  // ani przesuwać) — ta flaga odróżnia je od prawdziwych ScheduleEvent
  readOnly?: boolean;
  // Konflikty wykryte przez backend przy tworzeniu/edycji/przesunięciu
  // (patrz ScheduleService.findConflicts) — nie blokują zapisu, tylko
  // informują, że instalator ma już coś zaplanowane w tym czasie
  conflicts?: { id: string; title: string; startDate: string; endDate: string }[];
}

// Domyślny kolor rezerwowy, gdy wydarzenie nie ma jeszcze przypisanego
// instalatora z ustawionym kolorem profilu (np. wydarzenie bez assignee)
export const FALLBACK_COLOR = '#71717a';

// Etykiety i ikony (nazwa komponentu lucide-react) per typ wydarzenia.
// UWAGA: kolor wizualny aktywności w Harmonogramie pochodzi z PROFILU
// INSTALATORA (user.color), NIE stąd — tu tylko etykieta/ikona typu,
// żeby jedna osoba = jeden, spójny kolor niezależnie od tego co robi
// (patrz sekcja 17 specyfikacji). "color" poniżej używany jest wyłącznie
// jako fallback, gdy wydarzenie nie ma żadnego przypisanego instalatora.
export const EVENT_TYPE_META: Record<ScheduleEventType, { label: string; icon: string; color: string }> = {
  CONSTRUCTION: { label: 'Budowa', icon: 'HardHat', color: '#f97316' },
  TRIP: { label: 'Wyjazd', icon: 'Car', color: '#38bdf8' },
  MEASUREMENT: { label: 'Pomiar', icon: 'Gauge', color: '#a78bfa' },
  LEAVE: { label: 'Wolne', icon: 'Sun', color: '#4ade80' },
  TRAINING: { label: 'Szkolenie', icon: 'GraduationCap', color: '#facc15' },
  VEHICLE_INSPECTION: { label: 'Przegląd pojazdu', icon: 'Wrench', color: '#f87171' },
  MATERIAL_DELIVERY: { label: 'Dostawa materiałów', icon: 'Package', color: '#2dd4bf' },
  TASK: { label: 'Zadanie', icon: 'ClipboardList', color: '#94a3b8' },
  FAILURE: { label: 'Awaria', icon: 'AlertTriangle', color: '#ef4444' },
  BREAK: { label: 'Przerwa', icon: 'Coffee', color: '#fbbf24' },
  REFUELING: { label: 'Tankowanie', icon: 'Fuel', color: '#eab308' },
  OTHER: { label: 'Inne', icon: 'Calendar', color: '#64748b' },
};
