import {
  Plug, Lightbulb, ToggleRight, Siren, Eye, Blinds, Network, Box, Gauge, PlugZap, HelpCircle, Cpu, Video,
  type LucideIcon,
} from 'lucide-react';

/**
 * Katalog punktów planera instalacji. Klucze rodzajów, podtypów, aparatów i
 * puszek MUSZĄ być identyczne z backendem (backend/src/modules/plan-points/plan-catalog.ts) —
 * serwer waliduje je i nadaje numer (prefiks + kolejny numer, np. GN.3).
 */
export interface PlanSubtype { key: string; label: string; prefix: string }
export interface PlanKind { key: string; label: string; short: string; color: string; icon: LucideIcon; subtypes: PlanSubtype[] }

export const PLAN_KINDS: PlanKind[] = [
  { key: 'SOCKET', label: 'Gniazda', short: 'Gniazdo', color: '#f97316', icon: Plug, subtypes: [
    { key: 'single', label: 'Gniazdo pojedyncze 230V', prefix: 'GN' },
    { key: 'double', label: 'Gniazdo podwójne 230V', prefix: 'GN' },
    { key: 'ip44', label: 'Gniazdo hermetyczne IP44', prefix: 'GN' },
    { key: 'usb', label: 'Gniazdo z USB', prefix: 'GN' },
    { key: 'power', label: 'Gniazdo siłowe 400V', prefix: 'GS' },
  ] },
  { key: 'LIGHT', label: 'Oświetlenie', short: 'Lampa', color: '#eab308', icon: Lightbulb, subtypes: [
    { key: 'spot', label: 'Punktowe', prefix: 'LG' },
    { key: 'led', label: 'LED 230V', prefix: 'LED' },
    { key: 'sconce', label: 'Kinkiet', prefix: 'KINZ' },
    { key: 'ceiling', label: 'Plafon / lampa sufitowa', prefix: 'PL' },
    { key: 'track', label: 'Szynoprzewód', prefix: 'SZP' },
    { key: 'strip', label: 'Taśma LED', prefix: 'TAS' },
  ] },
  { key: 'FRAME', label: 'Ramka na osprzęt (łączniki, gniazda)', short: 'Ramka', color: '#3b82f6', icon: ToggleRight, subtypes: [
    { key: 'frame', label: 'Ramka na osprzęt', prefix: 'Ł' },
  ] },
  { key: 'ALARM_SENSOR', label: 'Czujniki alarmowe', short: 'Czujnik al.', color: '#ef4444', icon: Eye, subtypes: [
    { key: 'pir', label: 'Czujnik ruchu PIR', prefix: 'PIR' },
    { key: 'contact', label: 'Kontaktron', prefix: 'KON' },
    { key: 'smoke', label: 'Czujnik dymu', prefix: 'DYM' },
  ] },
  { key: 'ALARM_OUTLET', label: 'Wypusty alarmowe', short: 'Wypust al.', color: '#dc2626', icon: Siren, subtypes: [
    { key: 'siren', label: 'Syrena', prefix: 'SYGN' },
    { key: 'keypad', label: 'Manipulator', prefix: 'MAN' },
  ] },
  { key: 'AUTOMATION_SENSOR', label: 'Czujniki automatyki', short: 'Czujnik', color: '#14b8a6', icon: Gauge, subtypes: [
    { key: 'motion', label: 'Czujnik ruchu', prefix: 'CZR' },
    { key: 'temperature', label: 'Czujnik temperatury', prefix: 'CZT' },
    { key: 'dusk', label: 'Czujnik zmierzchu', prefix: 'CZZ' },
  ] },
  { key: 'SHADING', label: 'Zacienianie', short: 'Roleta', color: '#8b5cf6', icon: Blinds, subtypes: [
    { key: 'roller_ext', label: 'Roleta zewnętrzna', prefix: 'ROL' },
    { key: 'roller_int', label: 'Roleta wewnętrzna', prefix: 'ROW' },
    { key: 'blind', label: 'Żaluzja', prefix: 'ZAL' },
  ] },
  { key: 'INTERCOM', label: 'Domofon / wideodomofon', short: 'Domofon', color: '#06b6d4', icon: Video, subtypes: [
    { key: 'monitor', label: 'Wideodomofon (panel wewnętrzny)', prefix: 'VD' },
    { key: 'gate', label: 'Panel bramowy', prefix: 'PB' },
  ] },
  { key: 'DATA', label: 'LAN / TV / SAT', short: 'LAN/TV', color: '#22c55e', icon: Network, subtypes: [
    { key: 'lan', label: 'Gniazdo LAN (RJ45)', prefix: 'LAN' },
    { key: 'tv', label: 'Gniazdo TV/SAT', prefix: 'TV' },
    { key: 'wifi', label: 'Punkt dostępowy Wi-Fi', prefix: 'AP' },
  ] },
  { key: 'SMART', label: 'Smart home', short: 'Smart', color: '#ec4899', icon: Cpu, subtypes: [
    { key: 'panel', label: 'Panel dotykowy', prefix: 'PAN' },
    { key: 'actuator', label: 'Napęd (brama, okno)', prefix: 'NAP' },
  ] },
  { key: 'JUNCTION', label: 'Puszki', short: 'Puszka', color: '#a1a1aa', icon: Box, subtypes: [
    { key: 'junction', label: 'Puszka rozgałęźna', prefix: 'PR' },
    { key: 'installation', label: 'Puszka instalacyjna', prefix: 'PI' },
  ] },
  { key: 'OTHER', label: 'Inne', short: 'Inne', color: '#71717a', icon: HelpCircle, subtypes: [
    { key: 'other', label: 'Inny punkt', prefix: 'INNE' },
  ] },
];

export const FRAME_DEVICES: { key: string; label: string }[] = [
  { key: 'switch_single', label: 'Łącznik pojedynczy' },
  { key: 'switch_double', label: 'Łącznik podwójny' },
  { key: 'switch_stair', label: 'Łącznik schodowy pojedynczy' },
  { key: 'switch_stair_double', label: 'Łącznik schodowy podwójny' },
  { key: 'switch_cross', label: 'Łącznik krzyżowy pojedynczy' },
  { key: 'switch_blind', label: 'Łącznik żaluzjowy' },
  { key: 'dimmer', label: 'Ściemniacz' },
  { key: 'button', label: 'Przycisk' },
  { key: 'socket', label: 'Gniazdo 230V' },
  { key: 'socket_double', label: 'Gniazdo podwójne 230V' },
  { key: 'usb', label: 'Gniazdo USB' },
  { key: 'lan', label: 'Gniazdo LAN (RJ45)' },
  { key: 'tv', label: 'Gniazdo TV/SAT' },
  { key: 'thermostat', label: 'Regulator temperatury' },
  { key: 'blank', label: 'Zaślepka' },
];

export const BOX_TYPES: { key: string; label: string }[] = [
  { key: 'shallow40', label: 'Puszka płytka (głębokość 40 mm)' },
  { key: 'standard60', label: 'Puszka standardowa (głębokość 60 mm)' },
  { key: 'deep80', label: 'Puszka głęboka (głębokość 80 mm)' },
  { key: 'drywall', label: 'Puszka do płyt g-k' },
  { key: 'surface', label: 'Puszka natynkowa' },
];

export const MAX_FRAME_BOXES = 6;

// ---- Typy danych z API ----
export interface FrameBox {
  device: string;
  style: string;
  circuitDeviceId: string | null;
  lines: string[];
  smart: boolean;
  boxType: string | null;
}
export interface Frame { count: number; orientation: 'HORIZONTAL' | 'VERTICAL'; style: string; boxes: FrameBox[] }

export interface PlanPoint {
  id: string;
  planId: string;
  page: number;
  x: number;
  y: number;
  kind: string;
  subtype: string | null;
  prefix: string;
  seq: number;
  code: string;
  circuitDeviceId: string | null;
  lines: string[];
  smart: boolean;
  boxType: string | null;
  note: string | null;
  frame: Frame | null;
}

export interface PlanCircuit { id: string; boardName: string; position: number | null; description: string | null; label: string }
export interface SummaryRow { label: string; count: number }
export interface PlanSummary { total: number; points: SummaryRow[]; frames: SummaryRow[]; devices: SummaryRow[]; boxes: SummaryRow[]; noCircuit: number }

export const kindOf = (key: string) => PLAN_KINDS.find((k) => k.key === key);
export const subtypeLabel = (kind: string, subtype: string | null) =>
  kindOf(kind)?.subtypes.find((s) => s.key === subtype)?.label ?? '';

/** Zamienia pozycję kliknięcia na ułamek (0..1) wymiarów elementu; null gdy element ma zerowy rozmiar. */
export function pointerToFraction(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
}

export function defaultFrame(count = 1): Frame {
  return {
    count,
    orientation: 'HORIZONTAL',
    style: '',
    boxes: Array.from({ length: count }, () => ({ device: 'switch_single', style: '', circuitDeviceId: null, lines: [], smart: false, boxType: null })),
  };
}

/** Zmienia liczbę puszek w ramce zachowując już ustawione (nowe dostają wartości domyślne). */
export function resizeFrame(frame: Frame, count: number): Frame {
  const boxes = frame.boxes.slice(0, count);
  while (boxes.length < count) boxes.push({ device: 'switch_single', style: '', circuitDeviceId: null, lines: [], smart: false, boxType: null });
  return { ...frame, count, boxes };
}
