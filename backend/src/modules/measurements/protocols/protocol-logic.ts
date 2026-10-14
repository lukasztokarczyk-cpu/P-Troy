import { randomUUID } from 'crypto';
import { SectionDef, ColumnDef, BUILTIN_SECTIONS, CHECK_STATES } from './protocol-schema';

/**
 * Czysta logika biznesowa Protokołów — bez Nest/Prisma, żeby dało się ją
 * testować samodzielnie. Zasady:
 *  - zatwierdzony protokół jest niezmienny (egzekwuje serwis),
 *  - wartości normowe NIGDY nie są zakładane: obliczenia działają wyłącznie
 *    na współczynnikach wpisanych przez administratora (CalcConfig),
 *  - wynik obliczeń to tylko PODPOWIEDŹ — ocenę zawsze wybiera człowiek.
 */

export const TIMEZONE = 'Europe/Warsaw';
export const DEADLINE_SOON_DAYS = 14;
export const DEADLINE_APPROACHING_DAYS = 60;

export const newId = () => randomUUID();

// ---------------------------------------------------------------------------
// Numeracja: PR/ROK/00001
// ---------------------------------------------------------------------------

export function formatProtocolNumber(year: number, seq: number): string {
  return `PR/${year}/${String(seq).padStart(5, '0')}`;
}

export function nextProtocolNumber(existingNumbers: string[], year: number): string {
  const prefix = `PR/${year}/`;
  let max = 0;
  for (const n of existingNumbers) {
    if (!n.startsWith(prefix)) continue;
    const seq = parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return formatProtocolNumber(year, max + 1);
}

// ---------------------------------------------------------------------------
// Daty (kalendarzowe, strefa Europe/Warsaw)
// ---------------------------------------------------------------------------

/** Dzisiejsza data kalendarzowa w Warszawie jako "YYYY-MM-DD". */
export function warsawToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Normalizuje Date | "YYYY-MM-DD" | ISO do "YYYY-MM-DD" (data-only zapisywana jako UTC midnight). */
export function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  const d = toDateOnly(value);
  return d ? new Date(`${d}T00:00:00.000Z`) : null;
}

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Liczba dni kalendarzowych do terminu (ujemna = po terminie). */
export function daysUntil(due: Date | string, now: Date = new Date()): number {
  const dueYmd = toDateOnly(due);
  if (!dueYmd) return NaN;
  return dayNumber(dueYmd) - dayNumber(warsawToday(now));
}

export function formatPlDate(value: Date | string | null | undefined): string {
  const d = toDateOnly(value);
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export type DeadlineBand = 'OVERDUE' | 'SOON' | 'APPROACHING' | 'FAR';

/** Pasma kolorystyczne widoku terminów: ciemnoczerwony / czerwony / żółty / zielony. */
export function deadlineBand(days: number): DeadlineBand {
  if (days < 0) return 'OVERDUE';
  if (days <= DEADLINE_SOON_DAYS) return 'SOON';
  if (days <= DEADLINE_APPROACHING_DAYS) return 'APPROACHING';
  return 'FAR';
}

export function displayStatus(
  p: { status: string; nextInspectionDate?: Date | string | null; deadlineClosedAt?: Date | string | null },
  now: Date = new Date(),
): string {
  if (p.status === 'COMPLETED' && p.nextInspectionDate && !p.deadlineClosedAt) {
    const d = daysUntil(p.nextInspectionDate, now);
    if (Number.isFinite(d) && d < 0) return 'OVERDUE';
  }
  return p.status;
}

// ---------------------------------------------------------------------------
// Przypomnienia D14 / D7 / D0 / OVERDUE z „nadrabianiem”
// ---------------------------------------------------------------------------

export type ReminderKind = 'D14' | 'D7' | 'D0' | 'OVERDUE';

/**
 * Zwraca JEDNO przypomnienie, które należy teraz wysłać (albo null).
 * „Nadrabianie”: jeśli cron nie zadziałał dokładnie w dniu progu (np. awaria
 * serwera), przy najbliższym uruchomieniu wysyłamy najpilniejsze jeszcze
 * niewysłane przypomnienie dla aktualnej liczby dni — bez zasypywania
 * użytkownika zaległymi, mniej pilnymi.
 */
export function reminderToSend(days: number, alreadySent: Set<string>): ReminderKind | null {
  if (!Number.isFinite(days)) return null;
  let kind: ReminderKind | null = null;
  if (days < 0) kind = 'OVERDUE';
  else if (days === 0) kind = 'D0';
  else if (days <= 7) kind = 'D7';
  else if (days <= DEADLINE_SOON_DAYS) kind = 'D14';
  if (!kind || alreadySent.has(kind)) return null;
  return kind;
}

export function plDays(n: number): string {
  const abs = Math.abs(n);
  if (abs === 1) return '1 dzień';
  return `${abs} dni`;
}

export function reminderMessage(
  kind: ReminderKind,
  ctx: { siteName: string; address?: string | null; dueDate: Date | string; days: number; number: string },
): { title: string; message: string } {
  const lines = [
    `Budowa: ${ctx.siteName}`,
    ctx.address ? `Adres: ${ctx.address}` : null,
    `Protokół: ${ctx.number}`,
    `Termin badania: ${formatPlDate(ctx.dueDate)}`,
  ].filter(Boolean) as string[];

  switch (kind) {
    case 'D14':
      return {
        title: '⚠️ Zbliża się termin badania',
        message: [...lines, `Do terminu pozostało ${plDays(ctx.days)}.`].join('\n'),
      };
    case 'D7':
      return {
        title: '⚠️ Zbliża się termin badania',
        message: [...lines, ctx.days === 7 ? 'Termin badania za 7 dni.' : `Do terminu pozostało ${plDays(ctx.days)}.`].join('\n'),
      };
    case 'D0':
      return { title: '⚠️ Termin badania', message: [...lines, 'Dzisiaj upływa termin badania.'].join('\n') };
    case 'OVERDUE':
      return {
        title: '⚠️ Termin badania przekroczony',
        message: [...lines, 'Termin badania został przekroczony.'].join('\n'),
      };
  }
}

// ---------------------------------------------------------------------------
// Liczby i obliczenia (tylko ze współczynników administratora)
// ---------------------------------------------------------------------------

/** Parsuje liczbę z przecinkiem lub kropką. Pusty/niepoprawny → null. */
export function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Pusta wartość jest poprawna (pole opcjonalne); niepusta musi być liczbą. */
export function isValidNumberInput(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return parseNum(v) !== null;
}

export interface CalcConfig {
  /** Napięcie U0 [V] — wpisuje administrator. */
  u0?: number | null;
  /** Krotność prądu zadziałania Ia = k × In dla charakterystyki — wpisuje administrator. */
  coefficients?: Partial<Record<'B' | 'C' | 'D' | 'K' | 'Z', number | null>>;
  /** Podstawa kryterium pokazywana w wydruku, np. nazwa normy/projektu. */
  basis?: string | null;
}

const round = (n: number, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export interface LoopCalcResult {
  ia: number | null;
  zsRequired: number | null;
  basis: string | null;
}

/** Ia i wymagane Zs — tylko gdy administrator skonfigurował U0 i współczynnik. */
export function computeLoop(
  row: { inA?: unknown; characteristic?: unknown },
  cfg: CalcConfig | null | undefined,
): LoopCalcResult {
  const empty: LoopCalcResult = { ia: null, zsRequired: null, basis: cfg?.basis ?? null };
  if (!cfg) return empty;
  const inA = parseNum(row.inA);
  const ch = String(row.characteristic ?? '').toUpperCase() as 'B' | 'C' | 'D' | 'K' | 'Z';
  const k = parseNum(cfg.coefficients?.[ch]);
  if (inA === null || k === null || k <= 0) return empty;
  const ia = round(k * inA);
  const u0 = parseNum(cfg.u0);
  if (u0 === null || u0 <= 0 || ia <= 0) return { ia, zsRequired: null, basis: cfg.basis ?? null };
  return { ia, zsRequired: round(u0 / ia), basis: cfg.basis ?? null };
}

/** Wypełnia kolumny wyliczane w wierszach pętli zwarcia (nadpisuje stare wartości wyliczane). */
export function applyLoopCalc<T extends Record<string, any>>(rows: T[], cfg: CalcConfig | null | undefined): T[] {
  return rows.map((r) => {
    const calc = computeLoop(r, cfg);
    return { ...r, ia: calc.ia, zsRequired: calc.zsRequired, criterionBasis: calc.basis };
  });
}

/** Podpowiedź oceny — NIGDY nie jest ustawiana automatycznie. */
export function suggestRating(zs: unknown, zsRequired: unknown): 'OK' | 'NIE' | null {
  const a = parseNum(zs);
  const b = parseNum(zsRequired);
  if (a === null || b === null) return null;
  return a <= b ? 'OK' : 'NIE';
}

// ---------------------------------------------------------------------------
// Widoczność i puste sekcje
// ---------------------------------------------------------------------------

type AnyData = Record<string, any>;

const hasValue = (v: unknown) =>
  v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '') && v !== false;

export function mergedSections(custom: SectionDef[] = []): SectionDef[] {
  return [...BUILTIN_SECTIONS, ...custom];
}

export function isSectionApplicable(def: SectionDef, objectType: string | null | undefined, data: AnyData): boolean {
  if (def.objectTypes && def.objectTypes.length && objectType && !def.objectTypes.includes(objectType as any)) {
    return false;
  }
  if (def.visibleWhen?.extrasAnyOf) {
    const flags = data?.extras ?? {};
    if (!def.visibleWhen.extrasAnyOf.some((k) => flags[k] === true)) return false;
  }
  return true;
}

export function meaningfulRows(rows: any): Record<string, any>[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && Object.entries(r).some(([k, v]) => k !== 'id' && hasValue(v)));
}

export function isSectionEmpty(def: SectionDef, data: AnyData): boolean {
  if (def.isCustom) {
    const block = data?.custom?.[def.key] ?? {};
    if (def.columns?.length) return meaningfulRows(block.rows).length === 0;
    return !Object.entries(block).some(([k, v]) => k !== 'rows' && hasValue(v));
  }
  const block = data?.[def.key];
  switch (def.kind) {
    case 'fields': {
      const custom = data?.custom?.[def.key] ?? {};
      return (
        !Object.values(block ?? {}).some(hasValue) &&
        !Object.entries(custom).some(([k, v]) => k !== 'rows' && hasValue(v))
      );
    }
    case 'table':
      return meaningfulRows(block).length === 0;
    case 'checklist':
      return !(block?.items ?? []).some((i: any) => hasValue(i?.state) || hasValue(i?.note));
    case 'lightning':
      return !block?.present;
    case 'extras':
      return !Object.entries(block ?? {}).some(([k, v]) => k !== 'otherName' && v === true);
    case 'conclusions':
      return !hasValue(block?.text) && !hasValue(block?.finalRating);
    default:
      return true;
  }
}

/** Sekcje, które trafiają do PDF: dotyczą obiektu i nie są puste. */
export function printableSections(
  objectType: string | null | undefined,
  data: AnyData,
  custom: SectionDef[] = [],
): SectionDef[] {
  return mergedSections(custom).filter(
    (s) => isSectionApplicable(s, objectType, data) && !isSectionEmpty(s, data),
  );
}

// ---------------------------------------------------------------------------
// Kopiowanie struktury z poprzedniego protokołu (BEZ wyników)
// ---------------------------------------------------------------------------

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function resultKeys(columns: ColumnDef[] | undefined): Set<string> {
  return new Set((columns ?? []).filter((c) => c.isResult || c.computed).map((c) => c.key));
}

export function copyStructure(data: AnyData | null | undefined, custom: SectionDef[] = []): AnyData {
  const src = data ?? {};
  const out: AnyData = {};

  for (const def of BUILTIN_SECTIONS) {
    const block = src[def.key];
    if (block === undefined || def.copy === 'none') continue;

    if (def.copy === 'all') {
      out[def.key] = clone(block);
      continue;
    }

    // copy === 'structure'
    if (def.kind === 'table') {
      const skip = resultKeys(def.columns);
      out[def.key] = (Array.isArray(block) ? block : []).map((row: Record<string, any>) => {
        const next: Record<string, any> = { id: newId() };
        for (const [k, v] of Object.entries(row)) {
          if (k === 'id' || skip.has(k) || k === 'criterionBasis') continue;
          next[k] = clone(v);
        }
        return next;
      });
    } else if (def.kind === 'checklist') {
      out[def.key] = {
        items: (block?.items ?? []).map((i: any) => ({ ...i, state: null, note: '' })),
      };
    } else if (def.kind === 'lightning') {
      out[def.key] = {
        present: !!block?.present,
        items: (block?.items ?? []).map((i: any) => ({ ...i, state: null, note: '' })),
      };
    }
  }

  // Własne sekcje i pola
  const customOut: AnyData = {};
  for (const [sectionKey, block] of Object.entries<any>(src.custom ?? {})) {
    const builtin = BUILTIN_SECTIONS.find((s) => s.key === sectionKey);
    const def = custom.find((s) => s.key === sectionKey);
    if (builtin) {
      // Pola własne w sekcji wbudowanej: kopiujemy tylko w sekcjach „technicznych” (copy = all).
      if (builtin.copy === 'all') customOut[sectionKey] = clone(block);
      continue;
    }
    if (def?.columns?.length) {
      const skip = resultKeys(def.columns);
      customOut[sectionKey] = {
        rows: (block?.rows ?? []).map((row: Record<string, any>) => {
          const next: Record<string, any> = { id: newId() };
          for (const [k, v] of Object.entries(row)) if (k !== 'id' && !skip.has(k)) next[k] = clone(v);
          return next;
        }),
      };
    }
  }
  if (Object.keys(customOut).length) out.custom = customOut;

  return out;
}

// ---------------------------------------------------------------------------
// Walidacja przed zatwierdzeniem (zapis wersji roboczej nigdy nie jest blokowany)
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  code: string;
  message: string;
  section?: string;
}

export interface ApprovalInput {
  performedAt?: Date | string | null;
  objectType?: string | null;
  objectTypeName?: string | null;
  inspectionKind?: string | null;
  inspectionKindName?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  performerName?: string | null;
  nextInspectionDate?: Date | string | null;
  data: AnyData | null | undefined;
  /** Role podpisów: 'PERFORMER' | 'REPRESENTATIVE'. */
  signatureRoles: string[];
  customSections?: SectionDef[];
  customFields?: { sectionKey: string; key: string; label: string; type: string; required: boolean }[];
}

export function validateForApproval(input: ApprovalInput): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const data: AnyData = input.data ?? {};
  const err = (code: string, message: string, section?: string) => errors.push({ code, message, section });
  const warn = (code: string, message: string, section?: string) => warnings.push({ code, message, section });

  if (!input.performedAt) err('NO_DATE', 'Brak daty wykonania.');
  if (!input.objectType) err('NO_OBJECT_TYPE', 'Nie wybrano typu obiektu.');
  else if (input.objectType === 'OTHER' && !hasValue(input.objectTypeName)) {
    err('NO_OBJECT_TYPE_NAME', 'Wpisz nazwę typu obiektu („Inny”).');
  }
  if (!input.inspectionKind) err('NO_INSPECTION_KIND', 'Nie wybrano rodzaju kontroli.');
  else if (input.inspectionKind === 'OTHER' && !hasValue(input.inspectionKindName)) {
    err('NO_INSPECTION_KIND_NAME', 'Wpisz rodzaj kontroli („Inna”).');
  }
  if (!hasValue(input.siteName)) err('NO_SITE', 'Brak danych obiektu (nazwa budowy / obiektu).');
  if (!hasValue(input.siteAddress)) warn('NO_ADDRESS', 'Brak adresu obiektu.');
  if (!hasValue(input.performerName)) err('NO_PERFORMER', 'Brak osoby wykonującej pomiary.');

  if (!input.signatureRoles.includes('PERFORMER')) {
    err('NO_PERFORMER_SIGNATURE', 'Brak podpisu osoby wykonującej badanie.');
  }
  if (!input.signatureRoles.includes('REPRESENTATIVE')) {
    warn('NO_REPRESENTATIVE_SIGNATURE', 'Brak podpisu przedstawiciela właściciela / zarządcy.');
  }

  if (!hasValue(data?.conclusions?.finalRating)) {
    err('NO_FINAL_RATING', 'Nie wybrano oceny końcowej — wybierz ją świadomie.', 'conclusions');
  }

  // Poprawność liczb + puste wyniki
  let measurementRows = 0;
  const allSections = mergedSections(input.customSections);
  for (const def of allSections) {
    if (def.kind !== 'table' || !def.columns) continue;
    const rows = def.isCustom ? data?.custom?.[def.key]?.rows : data?.[def.key];
    const filled = meaningfulRows(rows);
    if (def.measurement && def.key !== 'devices') measurementRows += filled.length;

    let badNumbers = 0;
    let missingResults = 0;
    for (const row of filled) {
      for (const col of def.columns) {
        if (col.type === 'number' && !isValidNumberInput(row[col.key])) badNumbers++;
      }
      if (def.measurement) {
        const resultCols = def.columns.filter((c) => c.isResult);
        if (resultCols.length && resultCols.every((c) => !hasValue(row[c.key]))) missingResults++;
      }
    }
    if (badNumbers) err('BAD_NUMBER', `${def.title}: ${badNumbers} wartości mają błędny format liczby.`, def.key);
    if (missingResults) warn('EMPTY_RESULT', `${def.title}: ${missingResults} wierszy bez wyniku.`, def.key);
  }
  for (const key of ['lightning']) {
    const r = parseNum(data?.[key]?.earthingResistance);
    if (!isValidNumberInput(data?.[key]?.earthingResistance) || (data?.[key]?.earthingResistance && r === null)) {
      err('BAD_NUMBER', 'Instalacja odgromowa: błędny format rezystancji uziemienia.', key);
    }
  }
  if (measurementRows === 0) warn('NO_RESULTS', 'Protokół nie zawiera żadnych wyników pomiarów.');
  if (measurementRows > 0 && meaningfulRows(data?.instruments).length === 0) {
    warn('NO_INSTRUMENTS', 'Brak przyrządów pomiarowych.', 'instruments');
  }

  const inspectionItems: any[] = data?.inspection?.items ?? [];
  const undone = inspectionItems.filter((i) => !CHECK_STATES.includes(i?.state)).length;
  if (inspectionItems.length && undone) warn('INSPECTION_INCOMPLETE', `Oględziny: ${undone} pozycji bez oceny.`, 'inspection');

  // Własne pola obowiązkowe
  for (const f of input.customFields ?? []) {
    if (!f.required) continue;
    const v = data?.custom?.[f.sectionKey]?.[f.key];
    const empty = f.type === 'table' ? meaningfulRows(v).length === 0 : !hasValue(v);
    if (empty) err('MISSING_REQUIRED_FIELD', `Pole obowiązkowe „${f.label}” jest puste.`, f.sectionKey);
  }

  if (!input.nextInspectionDate) warn('NO_NEXT_DATE', 'Nie ustawiono daty kolejnego badania — nie będzie przypomnienia.');

  // Spójność oceny (tylko ostrzeżenia — ocenę zatwierdza człowiek)
  const final = data?.conclusions?.finalRating;
  const anyNegative = allSections.some((def) => {
    if (def.kind !== 'table' || !def.columns) return false;
    const rows = def.isCustom ? data?.custom?.[def.key]?.rows : data?.[def.key];
    return meaningfulRows(rows).some((r) => def.columns!.some((c) => c.type === 'rating' && r[c.key] === 'NIE'));
  });
  if ((final === 'POSITIVE' || final === 'POSITIVE_WITH_REMARKS') && anyNegative) {
    warn('RATING_MISMATCH', 'Ocena końcowa jest pozytywna, ale w tabelach są pozycje ocenione jako NIE.');
  }
  const openDefects = meaningfulRows(data?.defects).filter(
    (d) => d.status !== 'Usunięta' && d.status !== 'Zweryfikowana',
  ).length;
  if (final === 'POSITIVE' && openDefects) {
    warn('OPEN_DEFECTS', `Ocena „Pozytywna”, a nieusuniętych usterek jest: ${openDefects}.`, 'defects');
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Pomocnicze
// ---------------------------------------------------------------------------

/** Nazwa pliku PDF: Pomiary_PR-2026-00124_Pensjonat-Perla-Pienin.pdf */
export function slugify(text: string): string {
  return text
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pdfFileName(prefix: string, number: string, objectName: string): string {
  const parts = [prefix, number.replace(/\//g, '-'), slugify(objectName || '')].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}
