/** Czysta logika protokołu prostego (bez bazy) — testowalna osobno. */

export const DEFAULT_SIMPLE_ITEMS = [
  'Gniazdo pojedyncze',
  'Gniazdo podwójne',
  'Gniazdo z uziemieniem',
  'Gniazdo bryzgoszczelne',
  'Włącznik pojedynczy',
  'Włącznik podwójny',
  'Włącznik schodowy',
  'Włącznik krzyżowy',
  'Gniazdo RTV',
  'Gniazdo komputerowe RJ45',
  'Punkt oświetleniowy',
  'Oprawa oświetleniowa',
  'Czujnik ruchu',
  'Wentylator łazienkowy',
];

/** Podpowiedzi pomieszczeń — można też wpisać własne. */
export const DEFAULT_SIMPLE_ROOMS = [
  'Łazienka', 'Kuchnia', 'Salon', 'Sypialnia', 'Pokój', 'Przedpokój', 'Korytarz', 'Garaż', 'Piwnica', 'Taras / balkon', 'Kotłownia',
];

export interface SimpleItem { name: string; quantity: number; custom: boolean }

export interface SimpleRoom { name: string; items: SimpleItem[] }

export const EXTERNAL_KEYS = ['name', 'address'] as const;

export const formatSimpleNumber = (year: number, seq: number) => `PRP/${year}/${String(seq).padStart(4, '0')}`;

export function nextSimpleNumber(existing: string[], year: number): string {
  const prefix = `PRP/${year}/`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const v = parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return formatSimpleNumber(year, max + 1);
}

export function parseQty(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

/**
 * Normalizacja listy: puste/zerowe ilości są pomijane (nie są wymagane), błędne wartości (ujemne, tekst)
 * zgłaszane jako błąd; pozycja z ilością musi mieć nazwę.
 */
export function normalizeSimpleItems(raw: { name?: unknown; quantity?: unknown; custom?: unknown }[] | undefined): { items: SimpleItem[]; errors: string[] } {
  const items: SimpleItem[] = [];
  const errors: string[] = [];
  for (const r of raw ?? []) {
    const name = String(r.name ?? '').trim();
    const blankQty = r.quantity === null || r.quantity === undefined || String(r.quantity).trim() === '';
    if (blankQty) continue;
    const q = parseQty(r.quantity);
    if (q === null || q < 0) { errors.push(`${name || 'Pozycja'}: nieprawidłowa ilość.`); continue; }
    if (q === 0) continue;
    if (q > 1_000_000) { errors.push(`${name || 'Pozycja'}: ilość jest zbyt duża.`); continue; }
    if (!name) { errors.push('Własny element musi mieć nazwę.'); continue; }
    items.push({ name: name.slice(0, 200), quantity: q, custom: !!r.custom });
  }
  return { items, errors };
}

/**
 * Pomieszczenia z elementami. Puste ilości są pomijane, pomieszczenie bez żadnego elementu znika,
 * element z ilością musi mieć nazwę, pomieszczenie bez nazwy dostaje nazwę „Inne”.
 */
export function normalizeRooms(raw: { name?: unknown; items?: { name?: unknown; quantity?: unknown }[] }[] | undefined): { rooms: SimpleRoom[]; errors: string[] } {
  const rooms: SimpleRoom[] = [];
  const errors: string[] = [];
  for (const r of raw ?? []) {
    const { items, errors: e } = normalizeSimpleItems(r.items);
    errors.push(...e);
    if (!items.length) continue;
    rooms.push({ name: String(r.name ?? '').trim().slice(0, 100) || 'Inne', items });
  }
  return { rooms, errors };
}

/** Odczyt zapisanych danych; stary, płaski zapis (lista elementów bez pomieszczeń) trafia do jednego pomieszczenia. */
export function readRooms(stored: unknown): SimpleRoom[] {
  if (!Array.isArray(stored)) return [];
  const rooms: SimpleRoom[] = [];
  const flat: SimpleItem[] = [];
  for (const e of stored as any[]) {
    if (e && Array.isArray(e.items)) rooms.push({ name: String(e.name ?? 'Inne'), items: e.items.map((i: any) => ({ name: String(i.name), quantity: Number(i.quantity) || 0, custom: !!i.custom })) });
    else if (e && e.name !== undefined && e.quantity !== undefined) flat.push({ name: String(e.name), quantity: Number(e.quantity) || 0, custom: !!e.custom });
  }
  if (flat.length) rooms.push({ name: 'Elementy', items: flat });
  return rooms;
}

export function normalizeExternal(ext: Record<string, any> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of EXTERNAL_KEYS) out[k] = String(ext?.[k] ?? '').trim().slice(0, 300);
  return out;
}

export function fileSafe(s: string): string {
  return s.replace(/[^\w.\- ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+/g, '_').replace(/\s+/g, '_').slice(0, 60) || 'protokol';
}
