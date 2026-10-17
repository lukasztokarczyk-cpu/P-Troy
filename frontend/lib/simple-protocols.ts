// Protokół prosty — typy i pomocnicze funkcje (osobne od protokołu profesjonalnego).
import type { OrderPhotoView } from '@/lib/orders';

export interface SimpleItemView { name: string; quantity: number; custom: boolean }
export interface SimpleRoomView { name: string; items: SimpleItemView[] }
export interface SimpleDefaults { items: string[]; rooms: string[] }

export interface SimpleSiteView {
  source: 'SITE' | 'EXTERNAL';
  siteId: string | null;
  name: string;
  address: string;
}

export interface SimpleProtocolDetail {
  id: string;
  number: string;
  name: string;
  performedAt: string;
  description: string; // notatki
  rooms: SimpleRoomView[];
  site: SimpleSiteView;
  createdBy: { id: string; name: string };
  photos: Pick<OrderPhotoView, 'id' | 'fileName' | 'url' | 'thumbnailUrl'>[];
  defaults: SimpleDefaults;
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

/** Ilość trzymamy jako tekst, żeby dało się wpisać „2,5” i zostawić puste pole. */
export interface SimpleRowItem { key: string; name: string; qty: string; custom: boolean }
export interface SimpleRoomRow { key: string; name: string; items: SimpleRowItem[] }

let counter = 0;
export const newRowKey = () => `r${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const qtyText = (n: number) => String(n).replace('.', ',');

export function roomsToRows(rooms: SimpleRoomView[] = []): SimpleRoomRow[] {
  return rooms.map((r) => ({ key: newRowKey(), name: r.name, items: r.items.map((i) => ({ key: newRowKey(), name: i.name, qty: qtyText(i.quantity), custom: !!i.custom })) }));
}

/** Puste ilości są pomijane; wpisana ilość musi być liczbą ≥ 0, a element z ilością musi mieć nazwę. */
export function validateRooms(rooms: SimpleRoomRow[]): string | null {
  for (const r of rooms) {
    for (const i of r.items) {
      const q = i.qty.trim();
      if (!q) continue;
      const n = Number(q.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return `Nieprawidłowa ilość przy elemencie „${i.name || 'bez nazwy'}”`;
      if (n > 0 && !i.name.trim()) return 'Element z ilością musi mieć nazwę';
    }
  }
  return null;
}

export const newClientToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
