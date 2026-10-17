// Protokół prosty — typy i pomocnicze funkcje (osobne od protokołu profesjonalnego).
import type { OrderPhotoView } from '@/lib/orders';

export interface SimpleItemView { name: string; quantity: number; custom: boolean }

export interface SimpleSiteView {
  source: 'SITE' | 'EXTERNAL';
  siteId: string | null;
  name: string;
  address: string;
  investor?: string;
  contactPerson?: string;
  phone?: string;
}

export interface SimpleProtocolDetail {
  id: string;
  number: string;
  name: string;
  performedAt: string;
  description: string;
  items: SimpleItemView[];
  site: SimpleSiteView;
  createdBy: { id: string; name: string };
  photos: Pick<OrderPhotoView, 'id' | 'fileName' | 'url' | 'thumbnailUrl'>[];
  defaults: string[];
  permissions: { canEdit: boolean; canDelete: boolean; canPrint: boolean };
}

export interface SimpleProtocolListItem {
  id: string;
  number: string;
  name: string;
  performedAt: string;
  siteName: string;
  address: string;
  authorName: string;
  itemCount: number;
  photoCount: number;
}

/** Wiersz formularza: ilość trzymamy jako tekst, żeby dało się wpisać „2,5” i zostawić puste pole. */
export interface SimpleRow { key: string; name: string; qty: string; custom: boolean }

export const SIMPLE_EXTERNAL_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Nazwa budynku', required: true },
  { key: 'address', label: 'Adres' },
  { key: 'investor', label: 'Inwestor' },
  { key: 'contactPerson', label: 'Osoba kontaktowa' },
  { key: 'phone', label: 'Telefon' },
];

let counter = 0;
export const newRowKey = () => `r${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const qtyText = (n: number) => String(n).replace('.', ',');

/** Składa listę wierszy: najpierw stałe pozycje (z zapisanymi ilościami), potem własne elementy. */
export function buildRows(defaults: string[], saved: SimpleItemView[] = []): SimpleRow[] {
  const byName = new Map(saved.map((s) => [s.name, s]));
  const rows: SimpleRow[] = defaults.map((name) => ({ key: newRowKey(), name, qty: byName.has(name) ? qtyText(byName.get(name)!.quantity) : '', custom: false }));
  for (const s of saved) if (!defaults.includes(s.name)) rows.push({ key: newRowKey(), name: s.name, qty: qtyText(s.quantity), custom: true });
  return rows;
}

/** Jedyny sprawdzany warunek: wpisana ilość musi być liczbą ≥ 0, a element z ilością musi mieć nazwę. */
export function validateRows(rows: SimpleRow[]): string | null {
  for (const r of rows) {
    const q = r.qty.trim();
    if (!q) continue;
    const n = Number(q.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return `Nieprawidłowa ilość przy elemencie „${r.name || 'bez nazwy'}”`;
    if (n > 0 && !r.name.trim()) return 'Element z ilością musi mieć nazwę';
  }
  return null;
}

export const newClientToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
