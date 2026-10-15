/** Typy i pomocnicze funkcje modułu „Zamówienia”. */
import { parseNum } from './protocols';

export type OrderStatus = 'DRAFT' | 'SENT' | 'TO_ORDER' | 'ORDERED' | 'PARTIAL' | 'DELIVERED' | 'CANCELLED';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Wersja robocza',
  SENT: 'Wysłane',
  TO_ORDER: 'Do zamówienia',
  ORDERED: 'Zamówione',
  PARTIAL: 'Częściowo dostarczone',
  DELIVERED: 'Dostarczone',
  CANCELLED: 'Anulowane',
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  DRAFT: 'bg-zinc-800 text-zinc-300',
  SENT: 'bg-sky-900/40 text-sky-300',
  TO_ORDER: 'bg-amber-900/30 text-amber-300',
  ORDERED: 'bg-violet-900/40 text-violet-300',
  PARTIAL: 'bg-orange-900/40 text-orange-300',
  DELIVERED: 'bg-emerald-900/30 text-emerald-300',
  CANCELLED: 'bg-red-950 text-red-300 border border-red-900',
};

/** Kolejność statusów w liście wyboru (bez wersji roboczej — tę ustawia tylko autor). */
export const CHANGEABLE_STATUSES: OrderStatus[] = ['SENT', 'TO_ORDER', 'ORDERED', 'PARTIAL', 'DELIVERED', 'CANCELLED'];

export const UNIT_OPTIONS = ['szt.', 'm', 'op.', 'kpl.'];

export interface SiteOption { id: string; name: string; address: string | null }

export interface CatalogItem {
  id: string;
  categoryId: string;
  name: string;
  defaultUnit: string;
  specHint: string | null;
  isActive: boolean;
  sortOrder: number;
}
export interface CatalogCategory { id: string; name: string; isActive: boolean; sortOrder: number; items: CatalogItem[] }

export interface OrderListItem {
  id: string;
  number: string;
  status: OrderStatus;
  statusLabel: string;
  siteId: string;
  siteName: string;
  address: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  submittedAt: string | null;
  itemCount: number;
}

export interface OrderPhotoView { id: string; itemId: string | null; fileName: string; url: string; thumbnailUrl: string | null }

export interface OrderItemView {
  id: string;
  position: number;
  catalogItemId: string | null;
  name: string;
  spec: string | null;
  quantity: number;
  unit: string;
  note: string | null;
  isCustom: boolean;
  photos: OrderPhotoView[];
}

export interface OrderEventView {
  id: string;
  type: 'CREATED' | 'SUBMITTED' | 'STATUS' | 'EDIT' | 'COMMENT' | string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  message: string | null;
  createdAt: string;
  userName: string;
}

export interface OrderPermissions {
  canEditItems: boolean;
  canSubmit: boolean;
  canChangeStatus: boolean;
  canComment: boolean;
  canDelete: boolean;
  canPrint: boolean;
  canAddPhotos: boolean;
}

export interface OrderDetail {
  id: string;
  number: string;
  status: OrderStatus;
  statusLabel: string;
  note: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; address: string | null };
  createdBy: { id: string; name: string };
  items: OrderItemView[];
  orderPhotos: OrderPhotoView[];
  events: OrderEventView[];
  permissions: OrderPermissions;
}

export interface OrdersSummary { pending: number; toProcess: number; drafts: number }

/** Pozycja w edytorze (przed zapisem) — ilość trzymamy jako tekst, żeby dało się wpisać „2,5”. */
export interface DraftPhoto { key: string; fileName: string; base64: string; preview: string }
export interface DraftItem {
  key: string;
  id?: string;
  catalogItemId: string | null;
  name: string;
  spec: string;
  quantity: string;
  unit: string;
  note: string;
  isCustom: boolean;
  photos: OrderPhotoView[];
  pending: DraftPhoto[];
}

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const fmtQty = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return String(r).replace('.', ',');
};

export function itemFromView(i: OrderItemView): DraftItem {
  return {
    key: i.id,
    id: i.id,
    catalogItemId: i.catalogItemId,
    name: i.name,
    spec: i.spec ?? '',
    quantity: fmtQty(i.quantity),
    unit: i.unit,
    note: i.note ?? '',
    isCustom: i.isCustom,
    photos: i.photos,
    pending: [],
  };
}

export interface ItemProblem { key: string; message: string }

/** Te same zasady co na backendzie: nazwa, ilość > 0, jednostka. */
export function validateDraftItems(items: DraftItem[], requireAtLeastOne: boolean): string[] {
  const errs: string[] = [];
  if (requireAtLeastOne && items.length === 0) errs.push('Dodaj co najmniej jeden materiał.');
  items.forEach((it, idx) => {
    const label = it.name.trim() || `pozycja ${idx + 1}`;
    if (!it.name.trim()) errs.push(`Pozycja ${idx + 1}: brak nazwy materiału.`);
    const q = parseNum(it.quantity);
    if (q === null || q <= 0) errs.push(`${label}: ilość musi być większa od zera.`);
    if (!it.unit.trim()) errs.push(`${label}: brak jednostki.`);
  });
  return errs;
}

export const toPayloadItems = (items: DraftItem[]) =>
  items.map((it) => ({
    ...(it.id ? { id: it.id } : {}),
    ...(it.catalogItemId ? { catalogItemId: it.catalogItemId } : {}),
    name: it.name.trim(),
    spec: it.spec.trim(),
    quantity: parseNum(it.quantity) ?? 0,
    unit: it.unit.trim(),
    note: it.note.trim(),
    isCustom: it.isCustom,
  }));

export const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return String(iso);
  }
};

export const newClientToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
