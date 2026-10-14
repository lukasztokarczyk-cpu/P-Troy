/**
 * Protokoły — JEDNO ŹRÓDŁO PRAWDY o strukturze protokołu.
 *
 * Z tego pliku korzystają: walidacja, kopiowanie struktury, generowanie PDF
 * oraz endpoint GET /api/protocols/schema (frontend buduje z niego formularz).
 * Własne pola i sekcje dodane przez administratora (ProtocolFieldDefinition /
 * ProtocolSectionDefinition) są dołączane do tej struktury w runtime.
 *
 * Kształt danych protokołu (Measurement.data):
 *   data.installation  = { [fieldKey]: wartość }
 *   data.instruments   = Row[]                 (sekcje tabelaryczne: tablica wierszy)
 *   data.inspection    = { items: ChecklistItem[] }
 *   data.lightning     = { present: boolean, items: ChecklistItem[], earthingResistance, notes }
 *   data.extras        = { [flagKey]: boolean, otherName?: string }
 *   data.conclusions   = { text, finalRating, ratingConfirmedAt? }
 *   data.signoff       = { performer: {...}, representative: {...} }
 *   data.custom        = { [sectionKey]: { [fieldKey]: wartość, rows?: Row[] } }
 * Row = { id: string, [columnKey]: wartość }
 */

export type ObjectTypeKey = 'HOUSE' | 'PUBLIC' | 'OTHER';

export type ColumnType = 'text' | 'number' | 'select' | 'rating' | 'date';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  unit?: string;
  options?: string[];
  /** Względna szerokość kolumny w PDF (domyślnie 1). */
  w?: number;
  /** Wynik pomiaru — NIE jest kopiowany do nowego protokołu na podstawie poprzedniego. */
  isResult?: boolean;
  /** Kolumna identyfikująca wiersz (tytuł karty na telefonie). */
  primary?: boolean;
  /** Wartość wyliczana (np. Ia, wymagane Zs) — nie jest kopiowana, jest przeliczana. */
  computed?: boolean;
}

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
  hint?: string;
}

export type SectionKind = 'fields' | 'checklist' | 'table' | 'lightning' | 'extras' | 'conclusions';
export type SectionGroup = 'technical' | 'inspection' | 'measurement' | 'additional' | 'closing';
export type CopyMode = 'all' | 'structure' | 'none';

export interface VisibleWhen {
  /** Sekcja wyświetla się tylko, gdy w data.extras zaznaczono którąkolwiek z flag. */
  extrasAnyOf?: string[];
}

export interface SectionDef {
  key: string;
  title: string;
  kind: SectionKind;
  group: SectionGroup;
  /** Sekcja pomiarowa — wchodzi do „Drukuj pomiary” (27A). */
  measurement?: boolean;
  /** Typy obiektu, dla których sekcja jest dostępna (brak = wszystkie). */
  objectTypes?: ObjectTypeKey[];
  visibleWhen?: VisibleWhen;
  fields?: FieldDef[];
  columns?: ColumnDef[];
  /** Domyślne pozycje checklisty. */
  items?: string[];
  /** Czy użytkownik może dodać własną pozycję checklisty. */
  allowCustomItems?: boolean;
  addLabel?: string;
  copy: CopyMode;
  /** Sekcja własna (z bazy) — ustawiane w runtime. */
  isCustom?: boolean;
}

export const RATING_OPTIONS = ['OK', 'NIE', 'N/D'];
export const CHECK_STATES = ['OK', 'NIE', 'ND'] as const;
export type CheckState = (typeof CHECK_STATES)[number];

export const FINAL_RATINGS = [
  { value: 'POSITIVE', label: 'Pozytywna' },
  { value: 'POSITIVE_WITH_REMARKS', label: 'Pozytywna z uwagami' },
  { value: 'NEGATIVE', label: 'Negatywna' },
  { value: 'RECHECK', label: 'Wymaga ponownej kontroli' },
];

export const DEFECT_STATUSES = ['Nowa', 'Do usunięcia', 'W trakcie', 'Usunięta', 'Zweryfikowana'];
export const DEFECT_SEVERITIES = ['Niska', 'Średnia', 'Wysoka', 'Krytyczna'];

export const NET_SYSTEMS = ['TN-C', 'TN-S', 'TN-C-S', 'TT', 'IT', 'Inny'];

export const EXTRAS_FLAGS: { key: string; label: string }[] = [
  { key: 'emergencyLighting', label: 'Oświetlenie awaryjne' },
  { key: 'evacuationLighting', label: 'Oświetlenie ewakuacyjne' },
  { key: 'fireSwitch', label: 'Przeciwpożarowy wyłącznik prądu' },
  { key: 'fireDevicesPower', label: 'Zasilanie urządzeń ppoż.' },
  { key: 'ssp', label: 'SSP' },
  { key: 'dso', label: 'DSO' },
  { key: 'smokeVent', label: 'Oddymianie' },
  { key: 'pumps', label: 'Pompy' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'generator', label: 'Agregat' },
  { key: 'ups', label: 'UPS' },
  { key: 'pv', label: 'Fotowoltaika' },
  { key: 'energyStorage', label: 'Magazyn energii' },
  { key: 'technological', label: 'Instalacje technologiczne' },
  { key: 'other', label: 'Inne' },
];

export const INSPECTION_ITEMS = [
  'Stan rozdzielnic',
  'Stan przewodów i kabli',
  'Stan osprzętu',
  'Stan gniazd',
  'Stan wyłączników',
  'Oznaczenie obwodów',
  'Oznaczenie przewodów',
  'Stan zabezpieczeń',
  'RCD',
  'Przewody PE/N',
  'Połączenia wyrównawcze',
  'GSU',
  'Przepusty',
  'Obudowy',
  'Oznaczenia ostrzegawcze',
  'Dostęp do rozdzielnic',
  'Widoczne uszkodzenia',
];

export const BONDING_ITEMS = [
  'GSU',
  'Instalacja wodna',
  'CO',
  'Instalacja gazowa (jeżeli występuje)',
  'Konstrukcje metalowe',
  'Inne',
];

export const LIGHTNING_ITEMS = [
  'Oględziny LPS',
  'Przewody odprowadzające',
  'Złącza kontrolne',
  'Uziomy',
  'Połączenia',
  'Stan elementów',
];

const c = (key: string, label: string, type: ColumnType = 'text', extra: Partial<ColumnDef> = {}): ColumnDef => ({
  key,
  label,
  type,
  ...extra,
});

const rating = (key = 'rating', label = 'Ocena'): ColumnDef =>
  c(key, label, 'rating', { options: RATING_OPTIONS, isResult: true, w: 0.8 });

export const BUILTIN_SECTIONS: SectionDef[] = [
  {
    key: 'installation',
    title: 'Dane techniczne instalacji',
    kind: 'fields',
    group: 'technical',
    copy: 'all',
    fields: [
      { key: 'netSystem', label: 'Układ sieci', type: 'select', options: NET_SYSTEMS },
      { key: 'netSystemOther', label: 'Układ sieci — inny (jaki)', type: 'text' },
      { key: 'ratedVoltage', label: 'Napięcie znamionowe', type: 'text', unit: 'V' },
      { key: 'connectionPower', label: 'Moc przyłączeniowa', type: 'text', unit: 'kW' },
      { key: 'supplyType', label: 'Rodzaj zasilania', type: 'text' },
      { key: 'phases', label: 'Liczba faz', type: 'text' },
      { key: 'supplyLayout', label: 'Układ zasilania', type: 'text' },
      { key: 'installationType', label: 'Rodzaj instalacji', type: 'text' },
      { key: 'mainBoard', label: 'Główna rozdzielnica', type: 'text' },
      { key: 'boardCount', label: 'Liczba rozdzielnic', type: 'text' },
      { key: 'pvInfo', label: 'Instalacja PV', type: 'text' },
      { key: 'storageInfo', label: 'Magazyn energii', type: 'text' },
      { key: 'generatorInfo', label: 'Agregat', type: 'text' },
      { key: 'upsInfo', label: 'UPS', type: 'text' },
      { key: 'otherSources', label: 'Inne źródła zasilania', type: 'text' },
    ],
  },
  {
    key: 'instruments',
    title: 'Przyrządy pomiarowe',
    kind: 'table',
    group: 'technical',
    copy: 'none',
    addLabel: 'Dodaj przyrząd',
    columns: [
      c('manufacturer', 'Producent', 'text', { primary: true }),
      c('model', 'Model'),
      c('serialNumber', 'Nr fabryczny'),
      c('kind', 'Rodzaj miernika'),
      c('certificateNumber', 'Nr świadectwa wzorcowania'),
      c('calibrationDate', 'Data wzorcowania', 'date'),
      c('validUntil', 'Data ważności', 'date'),
    ],
  },
  {
    key: 'inspection',
    title: 'Oględziny instalacji',
    kind: 'checklist',
    group: 'inspection',
    copy: 'structure',
    items: INSPECTION_ITEMS,
    allowCustomItems: true,
    addLabel: 'Dodaj własny punkt oględzin',
  },
  {
    key: 'continuity',
    title: 'Ciągłość przewodów ochronnych',
    kind: 'table',
    group: 'measurement',
    measurement: true,
    copy: 'structure',
    addLabel: 'Dodaj pomiar',
    columns: [
      c('circuit', 'Obwód', 'text', { primary: true, w: 1.4 }),
      c('point', 'Punkt pomiarowy', 'text', { w: 1.2 }),
      c('conductor', 'Przewód'),
      c('resultOhm', 'Wynik', 'number', { unit: 'Ω', isResult: true }),
      c('requirement', 'Wymaganie'),
      rating(),
      c('notes', 'Uwagi', 'text', { w: 1.2, isResult: true }),
    ],
  },
  {
    key: 'insulation',
    title: 'Rezystancja izolacji',
    kind: 'table',
    group: 'measurement',
    measurement: true,
    copy: 'structure',
    addLabel: 'Dodaj pomiar',
    columns: [
      c('circuit', 'Obwód', 'text', { primary: true, w: 1.5 }),
      c('protection', 'Zabezpieczenie', 'text', { w: 0.9 }),
      c('section', 'Przekrój', 'text', { w: 0.8 }),
      c('testVoltage', 'U pom.', 'text', { unit: 'V', w: 0.7 }),
      c('ln', 'L-N', 'number', { unit: 'MΩ', isResult: true, w: 0.8 }),
      c('lpe', 'L-PE', 'number', { unit: 'MΩ', isResult: true, w: 0.8 }),
      c('npe', 'N-PE', 'number', { unit: 'MΩ', isResult: true, w: 0.8 }),
      c('required', 'Wymagana wartość', 'text', { w: 0.9 }),
      rating(),
      c('notes', 'Uwagi', 'text', { w: 1.1, isResult: true }),
    ],
  },
  {
    key: 'loop',
    title: 'Impedancja pętli zwarcia',
    kind: 'table',
    group: 'measurement',
    measurement: true,
    copy: 'structure',
    addLabel: 'Dodaj pomiar',
    columns: [
      c('circuit', 'Obwód', 'text', { primary: true, w: 1.4 }),
      c('point', 'Punkt pomiarowy', 'text', { w: 1.1 }),
      c('protection', 'Zabezpieczenie', 'text', { w: 0.9 }),
      c('protectionType', 'Typ zabezp.', 'text', { w: 0.8 }),
      c('inA', 'In', 'number', { unit: 'A', w: 0.6 }),
      c('characteristic', 'Charakterystyka', 'select', { options: ['B', 'C', 'D', 'K', 'Z'], w: 0.9 }),
      c('zs', 'Zs', 'number', { unit: 'Ω', isResult: true, w: 0.7 }),
      c('ia', 'Ia', 'number', { unit: 'A', computed: true, w: 0.7 }),
      c('zsRequired', 'Wymagane Zs', 'number', { unit: 'Ω', computed: true, w: 0.9 }),
      rating(),
      c('notes', 'Uwagi', 'text', { w: 1.1, isResult: true }),
    ],
  },
  {
    key: 'rcd',
    title: 'RCD',
    kind: 'table',
    group: 'measurement',
    measurement: true,
    copy: 'structure',
    addLabel: 'Dodaj RCD',
    columns: [
      c('location', 'Lokalizacja', 'text', { primary: true, w: 1.3 }),
      c('rcdType', 'Typ RCD', 'select', { options: ['AC', 'A', 'F', 'B'], w: 0.7 }),
      c('inA', 'In', 'number', { unit: 'A', w: 0.6 }),
      c('idn', 'IΔn', 'number', { unit: 'mA', w: 0.7 }),
      c('t05', '0,5 × IΔn', 'text', { isResult: true, w: 0.8 }),
      c('t1', '1 × IΔn', 'text', { isResult: true, w: 0.8 }),
      c('t5', '5 × IΔn', 'text', { isResult: true, w: 0.8 }),
      c('tripTime', 'Czas zadziałania', 'number', { unit: 'ms', isResult: true, w: 0.9 }),
      c('tripCurrent', 'Prąd zadziałania', 'number', { unit: 'mA', isResult: true, w: 0.9 }),
      rating(),
      c('notes', 'Uwagi', 'text', { w: 1.1, isResult: true }),
    ],
  },
  {
    key: 'earthing',
    title: 'Rezystancja uziemienia',
    kind: 'table',
    group: 'measurement',
    measurement: true,
    copy: 'structure',
    addLabel: 'Dodaj punkt',
    columns: [
      c('point', 'Punkt pomiarowy', 'text', { primary: true, w: 1.4 }),
      c('groundType', 'Rodzaj uziomu', 'text', { w: 1.4 }),
      c('method', 'Metoda pomiarowa', 'text', { w: 1.1 }),
      c('resultOhm', 'Wynik', 'number', { unit: 'Ω', isResult: true }),
      c('required', 'Wymagana / przyjęta wartość', 'text', { w: 1.2 }),
      rating(),
      c('notes', 'Uwagi', 'text', { w: 1.2, isResult: true }),
    ],
  },
  {
    key: 'bonding',
    title: 'Połączenia wyrównawcze',
    kind: 'checklist',
    group: 'measurement',
    measurement: true,
    copy: 'structure',
    items: BONDING_ITEMS,
    allowCustomItems: true,
    addLabel: 'Dodaj własne połączenie',
  },
  {
    key: 'lightning',
    title: 'Instalacja odgromowa',
    kind: 'lightning',
    group: 'measurement',
    measurement: true,
    copy: 'structure',
    items: LIGHTNING_ITEMS,
    allowCustomItems: true,
    addLabel: 'Dodaj własną pozycję',
  },
  {
    key: 'extras',
    title: 'Dodatkowe instalacje',
    kind: 'extras',
    group: 'additional',
    objectTypes: ['PUBLIC', 'OTHER'],
    copy: 'all',
  },
  {
    key: 'emergency',
    title: 'Oświetlenie awaryjne / ewakuacyjne',
    kind: 'table',
    group: 'additional',
    measurement: true,
    objectTypes: ['PUBLIC', 'OTHER'],
    visibleWhen: { extrasAnyOf: ['emergencyLighting', 'evacuationLighting'] },
    copy: 'structure',
    addLabel: 'Dodaj oprawę',
    columns: [
      c('location', 'Lokalizacja', 'text', { primary: true, w: 1.3 }),
      c('fixtureNo', 'Numer oprawy', 'text', { w: 0.8 }),
      c('type', 'Typ'),
      c('powerSource', 'Źródło zasilania', 'text', { w: 1 }),
      c('test', 'Test', 'text', { isResult: true, w: 0.8 }),
      c('duration', 'Czas działania', 'text', { isResult: true, w: 0.9 }),
      c('result', 'Wynik', 'rating', { options: RATING_OPTIONS, isResult: true, w: 0.7 }),
      c('notes', 'Uwagi', 'text', { w: 1.2, isResult: true }),
    ],
  },
  {
    key: 'fire_switch',
    title: 'Przeciwpożarowy wyłącznik prądu',
    kind: 'table',
    group: 'additional',
    measurement: true,
    objectTypes: ['PUBLIC', 'OTHER'],
    visibleWhen: { extrasAnyOf: ['fireSwitch'] },
    copy: 'structure',
    addLabel: 'Dodaj wyłącznik',
    columns: [
      c('location', 'Lokalizacja', 'text', { primary: true, w: 1.3 }),
      c('operation', 'Sposób działania', 'text', { w: 1.2 }),
      c('state', 'Stan'),
      c('test', 'Test', 'text', { isResult: true }),
      c('result', 'Wynik', 'rating', { options: RATING_OPTIONS, isResult: true, w: 0.7 }),
      c('notes', 'Uwagi', 'text', { w: 1.3, isResult: true }),
    ],
  },
  {
    key: 'devices',
    title: 'Urządzenia i odbiorniki',
    kind: 'table',
    group: 'additional',
    measurement: true,
    copy: 'structure',
    addLabel: 'Dodaj urządzenie',
    columns: [
      c('device', 'Urządzenie', 'text', { primary: true, w: 1.3 }),
      c('location', 'Lokalizacja', 'text', { w: 1.1 }),
      c('power', 'Moc', 'text', { unit: 'kW', w: 0.7 }),
      c('protection', 'Zabezpieczenie', 'text', { w: 0.9 }),
      c('circuit', 'Obwód', 'text', { w: 0.9 }),
      c('result', 'Wynik', 'text', { isResult: true, w: 0.9 }),
      c('notes', 'Uwagi', 'text', { w: 1.2, isResult: true }),
    ],
  },
  {
    key: 'defects',
    title: 'Usterki',
    kind: 'table',
    group: 'closing',
    copy: 'none',
    addLabel: 'Dodaj usterkę',
    columns: [
      c('no', 'Nr', 'text', { w: 0.4 }),
      c('location', 'Lokalizacja', 'text', { primary: true, w: 1 }),
      c('description', 'Opis', 'text', { w: 1.6 }),
      c('category', 'Kategoria', 'text', { w: 0.9 }),
      c('severity', 'Ważność', 'select', { options: DEFECT_SEVERITIES, w: 0.8 }),
      c('recommendation', 'Zalecenie', 'text', { w: 1.3 }),
      c('dueDate', 'Termin usunięcia', 'date', { w: 0.9 }),
      c('status', 'Status', 'select', { options: DEFECT_STATUSES, w: 0.9 }),
    ],
  },
  {
    key: 'conclusions',
    title: 'Wnioski i zalecenia',
    kind: 'conclusions',
    group: 'closing',
    copy: 'none',
  },
];

export function sectionByKey(key: string, extra: SectionDef[] = []): SectionDef | undefined {
  return BUILTIN_SECTIONS.find((s) => s.key === key) ?? extra.find((s) => s.key === key);
}

/** Układ strony PDF: poziomy przy więcej niż 8 kolumnach. */
export function orientationFor(columns: ColumnDef[] | undefined): 'portrait' | 'landscape' {
  return (columns?.length ?? 0) > 8 ? 'landscape' : 'portrait';
}

export const INSPECTION_KIND_LABELS: Record<string, string> = {
  PERIODIC: 'Kontrola okresowa',
  ACCEPTANCE: 'Odbiór instalacji',
  AFTER_MODERNIZATION: 'Kontrola po modernizacji',
  AFTER_RENOVATION: 'Kontrola po remoncie',
  AFTER_FIXES: 'Kontrola po usunięciu usterek',
  OTHER: 'Inna',
};

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  HOUSE: 'Dom jednorodzinny',
  PUBLIC: 'Budynek użyteczności publicznej',
  OTHER: 'Inny',
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Projekt',
  TODO: 'Do wykonania',
  IN_PROGRESS: 'W trakcie',
  COMPLETED: 'Zakończony',
  NEEDS_FIXES: 'Wymaga poprawek',
  OVERDUE: 'Po terminie',
};
