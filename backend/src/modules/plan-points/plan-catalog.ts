/**
 * Katalog punktów instalacji nanoszonych na rzut: rodzaje, podtypy i prefiksy
 * numeracji (GN.1, LG.3, Ł.2...). Kopia z etykietami i ikonami jest po stronie
 * frontendu (frontend/lib/plan-catalog.ts) — klucze muszą być identyczne.
 */
export interface SubtypeDef { key: string; label: string; prefix: string }
export interface KindDef { key: string; label: string; subtypes: SubtypeDef[] }

export const PLAN_KINDS: KindDef[] = [
  { key: 'SOCKET', label: 'Gniazda', subtypes: [
    { key: 'single', label: 'Gniazdo pojedyncze 230V', prefix: 'GN' },
    { key: 'double', label: 'Gniazdo podwójne 230V', prefix: 'GN' },
    { key: 'ip44', label: 'Gniazdo hermetyczne IP44', prefix: 'GN' },
    { key: 'usb', label: 'Gniazdo z USB', prefix: 'GN' },
    { key: 'power', label: 'Gniazdo siłowe 400V', prefix: 'GS' },
  ] },
  { key: 'LIGHT', label: 'Oświetlenie', subtypes: [
    { key: 'spot', label: 'Punktowe', prefix: 'LG' },
    { key: 'led', label: 'LED 230V', prefix: 'LED' },
    { key: 'sconce', label: 'Kinkiet', prefix: 'KINZ' },
    { key: 'ceiling', label: 'Plafon / lampa sufitowa', prefix: 'PL' },
    { key: 'track', label: 'Szynoprzewód', prefix: 'SZP' },
    { key: 'strip', label: 'Taśma LED', prefix: 'TAS' },
  ] },
  { key: 'FRAME', label: 'Ramka na osprzęt (łączniki, gniazda)', subtypes: [
    { key: 'frame', label: 'Ramka na osprzęt', prefix: 'Ł' },
  ] },
  { key: 'ALARM_SENSOR', label: 'Czujniki alarmowe', subtypes: [
    { key: 'pir', label: 'Czujnik ruchu PIR', prefix: 'PIR' },
    { key: 'contact', label: 'Kontaktron', prefix: 'KON' },
    { key: 'smoke', label: 'Czujnik dymu', prefix: 'DYM' },
  ] },
  { key: 'ALARM_OUTLET', label: 'Wypusty alarmowe', subtypes: [
    { key: 'siren', label: 'Syrena', prefix: 'SYGN' },
    { key: 'keypad', label: 'Manipulator', prefix: 'MAN' },
  ] },
  { key: 'AUTOMATION_SENSOR', label: 'Czujniki automatyki', subtypes: [
    { key: 'motion', label: 'Czujnik ruchu', prefix: 'CZR' },
    { key: 'temperature', label: 'Czujnik temperatury', prefix: 'CZT' },
    { key: 'dusk', label: 'Czujnik zmierzchu', prefix: 'CZZ' },
  ] },
  { key: 'SHADING', label: 'Zacienianie', subtypes: [
    { key: 'roller_ext', label: 'Roleta zewnętrzna', prefix: 'ROL' },
    { key: 'roller_int', label: 'Roleta wewnętrzna', prefix: 'ROW' },
    { key: 'blind', label: 'Żaluzja', prefix: 'ZAL' },
  ] },
  { key: 'INTERCOM', label: 'Domofon / wideodomofon', subtypes: [
    { key: 'monitor', label: 'Wideodomofon (panel wewnętrzny)', prefix: 'VD' },
    { key: 'gate', label: 'Panel bramowy', prefix: 'PB' },
  ] },
  { key: 'DATA', label: 'LAN / TV / SAT', subtypes: [
    { key: 'lan', label: 'Gniazdo LAN (RJ45)', prefix: 'LAN' },
    { key: 'tv', label: 'Gniazdo TV/SAT', prefix: 'TV' },
    { key: 'wifi', label: 'Punkt dostępowy Wi-Fi', prefix: 'AP' },
  ] },
  { key: 'SMART', label: 'Smart home', subtypes: [
    { key: 'panel', label: 'Panel dotykowy', prefix: 'PAN' },
    { key: 'actuator', label: 'Napęd (brama, okno)', prefix: 'NAP' },
  ] },
  { key: 'JUNCTION', label: 'Puszki', subtypes: [
    { key: 'junction', label: 'Puszka rozgałęźna', prefix: 'PR' },
    { key: 'installation', label: 'Puszka instalacyjna', prefix: 'PI' },
  ] },
  { key: 'OTHER', label: 'Inne', subtypes: [
    { key: 'other', label: 'Inny punkt', prefix: 'INNE' },
  ] },
];

// Aparaty/osprzęt montowane w puszkach ramki
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

export const FRAME_ORIENTATIONS = ['HORIZONTAL', 'VERTICAL'] as const;
export const MAX_FRAME_BOXES = 6;

export const KIND_KEYS = PLAN_KINDS.map((k) => k.key);
export const FRAME_DEVICE_KEYS = FRAME_DEVICES.map((d) => d.key);
export const BOX_TYPE_KEYS = BOX_TYPES.map((b) => b.key);

export function findKind(kind: string): KindDef | undefined {
  return PLAN_KINDS.find((k) => k.key === kind);
}

/** Podtyp (domyślnie pierwszy z rodzaju) albo null, gdy podtyp nie należy do rodzaju. */
export function resolveSubtype(kind: string, subtype?: string | null): SubtypeDef | null {
  const def = findKind(kind);
  if (!def) return null;
  if (!subtype) return def.subtypes[0];
  return def.subtypes.find((s) => s.key === subtype) ?? null;
}

export const labelOfKind = (kind: string) => findKind(kind)?.label ?? kind;
export const labelOfSubtype = (kind: string, subtype?: string | null) =>
  findKind(kind)?.subtypes.find((s) => s.key === subtype)?.label ?? '';
export const labelOfFrameDevice = (key?: string | null) => FRAME_DEVICES.find((d) => d.key === key)?.label ?? (key || '');
export const labelOfBoxType = (key?: string | null) => BOX_TYPES.find((b) => b.key === key)?.label ?? '';

// ----------------------------------------------------------------------
// Katalog efektywny = wbudowany (kod) + zmiany administratora (tabela plan_point_types)
// ----------------------------------------------------------------------

export interface TypeRow {
  id: string;
  kind: string;
  key: string;
  label: string;
  prefix: string | null;
  isCustom: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt?: Date;
}

export interface EffectiveSubtype {
  key: string;
  label: string;
  prefix: string;
  custom: boolean;      // dodany przez administratora
  archived: boolean;    // ukryty w palecie (punkty już naniesione zostają)
  id: string | null;    // id wiersza w bazie (własny typ albo nadpisanie wbudowanego)
  builtinLabel?: string; // oryginalna nazwa wbudowanego typu (do przywrócenia)
}
export interface EffectiveKind { key: string; label: string; subtypes: EffectiveSubtype[] }

export function buildCatalog(rows: TypeRow[], includeArchived: boolean): EffectiveKind[] {
  return PLAN_KINDS.map((kind) => {
    const kindRows = rows.filter((r) => r.kind === kind.key);
    const subtypes: EffectiveSubtype[] = kind.subtypes.map((s) => {
      const o = kindRows.find((r) => !r.isCustom && r.key === s.key);
      return {
        key: s.key, label: o?.label ?? s.label, prefix: s.prefix,
        custom: false, archived: !!o?.isArchived, id: o?.id ?? null, builtinLabel: s.label,
      };
    });
    const custom = kindRows
      .filter((r) => r.isCustom)
      .sort((a, b) => a.sortOrder - b.sortOrder || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
      .map<EffectiveSubtype>((r) => ({ key: r.key, label: r.label, prefix: r.prefix ?? 'INNE', custom: true, archived: r.isArchived, id: r.id }));
    const all = [...subtypes, ...custom];
    return { key: kind.key, label: kind.label, subtypes: includeArchived ? all : all.filter((s) => !s.archived) };
  });
}

/** Podtyp z katalogu efektywnego; bez `subtype` — pierwszy niezarchiwizowany. Zarchiwizowany jest akceptowany tylko gdy podano go jawnie i allowArchived. */
export function resolveEffectiveSubtype(rows: TypeRow[], kind: string, subtype?: string | null, allowArchived = false): EffectiveSubtype | null {
  const k = buildCatalog(rows, true).find((x) => x.key === kind);
  if (!k) return null;
  if (!subtype) return k.subtypes.find((s) => !s.archived) ?? null;
  const found = k.subtypes.find((s) => s.key === subtype);
  if (!found) return null;
  if (found.archived && !allowArchived) return null;
  return found;
}

/** Funkcja etykiet do zestawień/PDF: uwzględnia nazwy zmienione i dodane przez administratora. */
export function makeSubtypeLabeler(rows: TypeRow[]): (kind: string, subtype?: string | null) => string {
  const catalog = buildCatalog(rows, true);
  return (kind, subtype) => catalog.find((k) => k.key === kind)?.subtypes.find((s) => s.key === subtype)?.label ?? labelOfSubtype(kind, subtype);
}

export const PREFIX_REGEX = /^[A-ZĄĆĘŁŃÓŚŹŻ0-9]{1,6}$/;
