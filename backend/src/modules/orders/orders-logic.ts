/**
 * Zamówienia materiałów — czysta logika (bez bazy i bez Nest), dzięki czemu da się ją łatwo przetestować.
 */

export const ORDER_STATUSES = ['DRAFT', 'SENT', 'TO_ORDER', 'ORDERED', 'PARTIAL', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatusKey = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatusKey, string> = {
  DRAFT: 'Wersja robocza',
  SENT: 'Wysłane',
  TO_ORDER: 'Do zamówienia',
  ORDERED: 'Zamówione',
  PARTIAL: 'Częściowo dostarczone',
  DELIVERED: 'Dostarczone',
  CANCELLED: 'Anulowane',
};

/** Zamówienie „w toku” (liczone na kafelku): wysłane, ale jeszcze nie dostarczone ani anulowane. */
export const OPEN_STATUSES: OrderStatusKey[] = ['SENT', 'TO_ORDER', 'ORDERED', 'PARTIAL'];

export const UNITS = ['szt.', 'm', 'op.', 'kpl.'];

/** Budowa „aktywna” = niezarchiwizowana i nie zakończona (planowana, w toku, wstrzymana). */
export const ACTIVE_SITE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'];

export const TIMEZONE = 'Europe/Warsaw';

export const warsawYear = (now: Date = new Date()): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric' }).format(now));

export const formatOrderNumber = (year: number, seq: number) => `ZAM/${year}/${String(seq).padStart(4, '0')}`;

/** Następny numer w roku na podstawie istniejących numerów (ZAM/2026/0001 → ZAM/2026/0002). */
export function nextOrderNumber(existing: string[], year: number): string {
  const prefix = `ZAM/${year}/`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const seq = parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return formatOrderNumber(year, max + 1);
}

export interface ItemInput {
  id?: string;
  catalogItemId?: string | null;
  name: string;
  spec?: string | null;
  quantity: number;
  unit: string;
  note?: string | null;
  isCustom?: boolean;
}

export interface NormalizedItem {
  id?: string;
  catalogItemId: string | null;
  name: string;
  spec: string | null;
  quantity: number;
  unit: string;
  note: string | null;
  isCustom: boolean;
}

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s === '' ? null : s;
};

/** Ilość z przecinkiem lub kropką, zaokrąglona do 3 miejsc. */
export function parseQuantity(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

export function normalizeItem(i: ItemInput): NormalizedItem {
  return {
    id: i.id,
    catalogItemId: i.catalogItemId ?? null,
    name: clean(i.name) ?? '',
    spec: clean(i.spec),
    quantity: parseQuantity(i.quantity) ?? NaN,
    unit: clean(i.unit) ?? '',
    note: clean(i.note),
    isCustom: !!i.isCustom,
  };
}

/** Zwraca listę błędów (puste = OK). Wymagane: nazwa, ilość > 0, jednostka. */
export function validateItems(items: NormalizedItem[], { requireAtLeastOne }: { requireAtLeastOne: boolean }): string[] {
  const errors: string[] = [];
  if (requireAtLeastOne && items.length === 0) errors.push('Zamówienie musi zawierać co najmniej jedną pozycję.');
  items.forEach((it, idx) => {
    const label = it.name || `pozycja ${idx + 1}`;
    if (!it.name) errors.push(`Pozycja ${idx + 1}: brak nazwy materiału.`);
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) errors.push(`${label}: ilość musi być większa od zera.`);
    if (it.quantity > 1_000_000) errors.push(`${label}: ilość jest zbyt duża.`);
    if (!it.unit) errors.push(`${label}: brak jednostki.`);
  });
  return errors;
}

export const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

interface DiffItem { id: string; name: string; spec: string | null; quantity: number; unit: string; note: string | null }

/**
 * Opis zmian w pozycjach (do historii zamówienia) — każda zmiana to jedna linia.
 * Dzięki temu edycja przez administratora nigdy nie nadpisuje po cichu wcześniejszego stanu.
 */
export function diffItems(before: DiffItem[], after: DiffItem[]): string[] {
  const lines: string[] = [];
  const beforeById = new Map(before.map((b) => [b.id, b]));
  const afterIds = new Set(after.filter((a) => a.id).map((a) => a.id));
  for (const a of after) {
    const b = a.id ? beforeById.get(a.id) : undefined;
    if (!b) {
      lines.push(`+ Dodano: ${a.name}${a.spec ? ` (${a.spec})` : ''} — ${fmtQty(a.quantity)} ${a.unit}`);
      continue;
    }
    const parts: string[] = [];
    if (b.name !== a.name) parts.push(`nazwa: „${b.name}” → „${a.name}”`);
    if (b.quantity !== a.quantity || b.unit !== a.unit) parts.push(`ilość: ${fmtQty(b.quantity)} ${b.unit} → ${fmtQty(a.quantity)} ${a.unit}`);
    if ((b.spec ?? '') !== (a.spec ?? '')) parts.push(`specyfikacja: „${b.spec ?? ''}” → „${a.spec ?? ''}”`);
    if ((b.note ?? '') !== (a.note ?? '')) parts.push(`uwagi: „${b.note ?? ''}” → „${a.note ?? ''}”`);
    if (parts.length) lines.push(`~ ${b.name}: ${parts.join('; ')}`);
  }
  for (const b of before) {
    if (!afterIds.has(b.id)) lines.push(`− Usunięto: ${b.name} — ${fmtQty(b.quantity)} ${b.unit}`);
  }
  return lines;
}

export interface OrderPermissionInput {
  status: OrderStatusKey;
  isAuthor: boolean;
  privileged: boolean;
  admin: boolean;
}

export function orderPermissions(p: OrderPermissionInput) {
  const draft = p.status === 'DRAFT';
  return {
    canEditItems: (draft && p.isAuthor) || (!draft && p.privileged),
    canSubmit: draft && p.isAuthor,
    canChangeStatus: !draft && p.privileged,
    canComment: !draft && (p.isAuthor || p.privileged),
    canDelete: draft && (p.isAuthor || p.admin),
    canPrint: !draft && p.privileged,
    canAddPhotos: (draft && p.isAuthor) || (!draft && p.privileged),
  };
}

export const fileSafeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const orderPdfFileName = (number: string, siteName: string) =>
  `Zamowienie_${number.replace(/\//g, '-')}_${fileSafeName(siteName) || 'budowa'}.pdf`;
