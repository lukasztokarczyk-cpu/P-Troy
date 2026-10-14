/**
 * Moduł „Protokoły” (dawniej „Pomiary”) — typy, etykiety i czyste funkcje pomocnicze frontendu.
 * Struktura formularza (sekcje, kolumny) pochodzi z backendu (GET /api/protocols/schema),
 * więc nie jest tu duplikowana.
 */

export type ObjectType = 'HOUSE' | 'PUBLIC' | 'OTHER';
export type ColumnType = 'text' | 'number' | 'select' | 'rating' | 'date';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  unit?: string;
  options?: string[];
  w?: number;
  isResult?: boolean;
  primary?: boolean;
  computed?: boolean;
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  options?: string[];
  unit?: string;
  hint?: string;
}

export interface SectionDef {
  key: string;
  title: string;
  kind: 'fields' | 'checklist' | 'table' | 'lightning' | 'extras' | 'conclusions';
  group: 'technical' | 'inspection' | 'measurement' | 'additional' | 'closing';
  measurement?: boolean;
  objectTypes?: ObjectType[];
  visibleWhen?: { extrasAnyOf?: string[] };
  fields?: FieldDef[];
  columns?: ColumnDef[];
  items?: string[];
  allowCustomItems?: boolean;
  addLabel?: string;
  isCustom?: boolean;
  isActive?: boolean;
}

export interface CustomFieldDef {
  id: string;
  sectionKey: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'checkbox' | 'list' | 'table' | 'photo' | 'attachment';
  unit?: string | null;
  required: boolean;
  hint?: string | null;
  options?: any;
  isActive: boolean;
}

export interface ProtocolSchema {
  sections: SectionDef[];
  customFields: CustomFieldDef[];
  constants: {
    objectTypes: Record<string, string>;
    inspectionKinds: Record<string, string>;
    statuses: Record<string, string>;
    finalRatings: { value: string; label: string }[];
    extrasFlags: { key: string; label: string }[];
    defectStatuses: string[];
    defectSeverities: string[];
    netSystems: string[];
    ratingOptions: string[];
  };
}

export interface CalcConfig {
  u0: number | null;
  coefficients: Partial<Record<'B' | 'C' | 'D' | 'K' | 'Z', number | null>>;
  basis: string | null;
}

export interface ProtocolListItem {
  id: string;
  number: string;
  isLegacy: boolean;
  version: number;
  performedAt: string | null;
  siteId: string | null;
  siteName: string;
  address: string;
  isExternal: boolean;
  objectType: ObjectType | null;
  objectTypeLabel: string;
  inspectionKind: string | null;
  inspectionKindLabel: string;
  performerName: string;
  performerId: string;
  status: string;
  displayStatus: string;
  nextInspectionDate: string | null;
  daysToNext: number | null;
  band: DeadlineBand | null;
  deadlineClosed: boolean;
}

export interface ObjectInfo {
  source: 'SITE' | 'EXTERNAL';
  siteId: string | null;
  name: string;
  address: string;
  investor: string;
  owner: string;
  administrator: string;
  contactPerson: string;
  phone: string;
  email: string;
  siteManager: string;
  contractor: string;
  additionalInfo: string;
}

export interface AttachmentItem {
  id: string;
  kind: string;
  fieldKey: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string;
  thumbnailUrl: string | null;
}

export interface ProtocolDetail {
  id: string;
  number: string;
  isLegacy: boolean;
  status: string;
  displayStatus: string;
  version: number;
  objectType: ObjectType | null;
  objectTypeName: string | null;
  inspectionKind: string | null;
  inspectionKindName: string | null;
  performedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  nextInspectionDate: string | null;
  daysToNext: number | null;
  band: DeadlineBand | null;
  deadlineClosedAt: string | null;
  siteId: string | null;
  site: ObjectInfo;
  externalSite: Record<string, any> | null;
  performer: { userId: string; name: string; phone?: string | null; email?: string | null };
  performerExternal: Record<string, any> | null;
  description: string | null;
  data: Record<string, any> | null;
  legacy: { description: string | null; results: any; pdfUrl: string | null } | null;
  approvedAt: string | null;
  approvedBy: { id: string; name: string } | null;
  previousProtocolId: string | null;
  attachments: AttachmentItem[];
  signatures: { role: 'PERFORMER' | 'REPRESENTATIVE'; signerName: string; signedAt: string; imageUrl: string }[];
  history: { id: string; number: string; year: number; performedAt: string | null; status: string; version: number; nextInspectionDate: string | null; approved: boolean }[];
  lastAutosaveAt: string | null;
  updatedAt: string;
  pdfUrl: string | null;
  permissions: { canEdit: boolean; canApprove: boolean; canDelete: boolean; canEditNextDate: boolean; canManageDefinitions: boolean };
}

export type DeadlineBand = 'OVERDUE' | 'SOON' | 'APPROACHING' | 'FAR';

// ---------------------------------------------------------------------------
// Etykiety i style (jedno miejsce — zmiana kolorów nie wymaga szukania po komponentach)
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Projekt',
  TODO: 'Do wykonania',
  IN_PROGRESS: 'W trakcie',
  COMPLETED: 'Zakończony',
  NEEDS_FIXES: 'Wymaga poprawek',
  OVERDUE: 'Po terminie',
};

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-zinc-800 text-zinc-300',
  TODO: 'bg-sky-900/40 text-sky-300',
  IN_PROGRESS: 'bg-amber-900/30 text-amber-300',
  COMPLETED: 'bg-emerald-900/30 text-emerald-300',
  NEEDS_FIXES: 'bg-orange-900/40 text-orange-300',
  OVERDUE: 'bg-red-950 text-red-300 border border-red-900',
};

/** Kolory terminów: zielony — odległy, żółty — zbliża się, czerwony — ≤14 dni, ciemnoczerwony — po terminie. */
export const BAND_STYLES: Record<DeadlineBand, { chip: string; dot: string; cell: string; label: string }> = {
  FAR: { chip: 'bg-emerald-900/30 text-emerald-300', dot: 'bg-emerald-500', cell: 'border-emerald-800/60 bg-emerald-950/30', label: 'Termin odległy' },
  APPROACHING: { chip: 'bg-yellow-900/30 text-yellow-300', dot: 'bg-yellow-500', cell: 'border-yellow-800/60 bg-yellow-950/30', label: 'Zbliża się' },
  SOON: { chip: 'bg-red-900/40 text-red-300', dot: 'bg-red-500', cell: 'border-red-800/60 bg-red-950/40', label: 'Termin ≤ 14 dni' },
  OVERDUE: { chip: 'bg-red-950 text-red-200 border border-red-800', dot: 'bg-red-800', cell: 'border-red-900 bg-red-950/70', label: 'Po terminie' },
};

export const OBJECT_TYPE_OPTIONS: { value: ObjectType; label: string; hint: string }[] = [
  { value: 'HOUSE', label: 'Dom jednorodzinny', hint: 'Standardowy zakres pomiarów instalacji' },
  { value: 'PUBLIC', label: 'Budynek użyteczności publicznej', hint: 'Dodatkowe instalacje: oświetlenie awaryjne, ppoż., SSP i inne' },
  { value: 'OTHER', label: 'Inny', hint: 'Własna nazwa typu obiektu i ręcznie dobrany zakres' },
];

export const INSPECTION_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'PERIODIC', label: 'Kontrola okresowa' },
  { value: 'ACCEPTANCE', label: 'Odbiór instalacji' },
  { value: 'AFTER_MODERNIZATION', label: 'Kontrola po modernizacji' },
  { value: 'AFTER_RENOVATION', label: 'Kontrola po remoncie' },
  { value: 'AFTER_FIXES', label: 'Kontrola po usunięciu usterek' },
  { value: 'OTHER', label: 'Inna' },
];

export const EXTERNAL_SITE_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Nazwa obiektu', required: true },
  { key: 'address', label: 'Adres' },
  { key: 'investor', label: 'Inwestor' },
  { key: 'owner', label: 'Właściciel' },
  { key: 'administrator', label: 'Zarządca' },
  { key: 'contactPerson', label: 'Osoba kontaktowa' },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-mail' },
  { key: 'siteManager', label: 'Kierownik budowy' },
  { key: 'contractor', label: 'Wykonawca' },
  { key: 'additionalInfo', label: 'Dodatkowe informacje' },
];

export const EXTERNAL_PERFORMER_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Imię i nazwisko' },
  { key: 'company', label: 'Firma' },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-mail' },
  { key: 'qualificationsNumber', label: 'Numer uprawnień' },
  { key: 'qualificationsScope', label: 'Zakres uprawnień' },
  { key: 'certificateNumber', label: 'Numer świadectwa kwalifikacyjnego' },
  { key: 'certificateValidUntil', label: 'Data ważności' },
  { key: 'notes', label: 'Inne informacje' },
];

// ---------------------------------------------------------------------------
// Daty
// ---------------------------------------------------------------------------

const TZ = 'Europe/Warsaw';

/** Dzisiejsza data kalendarzowa w Polsce jako YYYY-MM-DD. */
export function todayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ymd;
}

/** „Ostatni zapis: 15:42” */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
}

export function daysLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return '';
  if (days < 0) return `po terminie o ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dzień' : 'dni'}`;
  if (days === 0) return 'dziś';
  return `za ${days} ${days === 1 ? 'dzień' : 'dni'}`;
}

// ---------------------------------------------------------------------------
// Liczby i obliczenia (tylko ze współczynników wpisanych przez administratora)
// ---------------------------------------------------------------------------

export function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const isBadNumber = (v: unknown) => !(v === null || v === undefined || String(v).trim() === '') && parseNum(v) === null;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface LoopCalc { ia: number | null; zsRequired: number | null; basis: string | null }

/** Ia = k × In oraz wymagane Zs = U0 / Ia — wyłącznie gdy administrator skonfigurował U0 i współczynnik. */
export function loopCalc(row: { inA?: unknown; characteristic?: unknown }, cfg: CalcConfig | null | undefined): LoopCalc {
  const none: LoopCalc = { ia: null, zsRequired: null, basis: cfg?.basis ?? null };
  if (!cfg) return none;
  const inA = parseNum(row.inA);
  const ch = String(row.characteristic ?? '').toUpperCase() as keyof CalcConfig['coefficients'];
  const k = parseNum(cfg.coefficients?.[ch]);
  if (inA === null || k === null || k <= 0) return none;
  const ia = round3(k * inA);
  const u0 = parseNum(cfg.u0);
  if (u0 === null || u0 <= 0 || ia <= 0) return { ia, zsRequired: null, basis: cfg.basis ?? null };
  return { ia, zsRequired: round3(u0 / ia), basis: cfg.basis ?? null };
}

/** Podpowiedź oceny. NIGDY nie ustawia oceny automatycznie — decyzję podejmuje uprawniona osoba. */
export function suggestRating(zs: unknown, zsRequired: unknown): 'OK' | 'NIE' | null {
  const a = parseNum(zs);
  const b = parseNum(zsRequired);
  if (a === null || b === null) return null;
  return a <= b ? 'OK' : 'NIE';
}

// ---------------------------------------------------------------------------
// Sekcje: widoczność
// ---------------------------------------------------------------------------

export function isSectionVisible(def: SectionDef, objectType: string | null | undefined, data: Record<string, any> | null | undefined): boolean {
  if (def.isActive === false) return false;
  if (def.objectTypes?.length && objectType && !def.objectTypes.includes(objectType as ObjectType)) return false;
  if (def.visibleWhen?.extrasAnyOf) {
    const flags = data?.extras ?? {};
    if (!def.visibleWhen.extrasAnyOf.some((k) => flags[k] === true)) return false;
  }
  return true;
}

export const newRowId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function emptyRow(columns: ColumnDef[]): Record<string, any> {
  const row: Record<string, any> = { id: newRowId() };
  for (const c of columns) row[c.key] = c.type === 'rating' ? null : '';
  return row;
}

// ---------------------------------------------------------------------------
// Pliki i zdjęcia
// ---------------------------------------------------------------------------

export interface UploadPayload { fileName: string; mimeType: string; base64: string }

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('Nie udało się odczytać pliku'));
    r.readAsDataURL(file);
  });
}

/**
 * Zdjęcia z telefonu bywają ogromne (kilkanaście MB) — zmniejszamy do 1800 px dłuższego boku
 * i zapisujemy jako JPEG, żeby wysyłka na słabym łączu była szybka. Inne pliki (PDF itd.) bez zmian.
 */
export async function fileToUploadPayload(file: File, maxSide = 1800): Promise<UploadPayload> {
  const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (!isImage || typeof document === 'undefined') {
    return { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64: await readAsDataUrl(file) };
  }
  try {
    const bitmapUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('img'));
      el.src = bitmapUrl;
    });
    URL.revokeObjectURL(bitmapUrl);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1 && file.size < 1_500_000) {
      return { fileName: file.name, mimeType: file.type, base64: await readAsDataUrl(file) };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.82);
    return { fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', base64 };
  } catch {
    return { fileName: file.name, mimeType: file.type, base64: await readAsDataUrl(file) };
  }
}

export function errorMessage(err: unknown): string {
  return (err as Error)?.message || 'Wystąpił błąd';
}
