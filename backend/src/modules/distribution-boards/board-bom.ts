/**
 * Wykaz aparatów w rozdzielniach: ile sztuk którego bezpiecznika (wyłącznika
 * nadprądowego), różnicówki i innego aparatu zastosowano. Czysta logika (bez
 * bazy) — korzysta z niej zarówno ekran, jak i PDF.
 */
export interface BomDevice {
  category: 'RCD' | 'MCB' | 'OTHER' | string;
  mcbCurve: string | null;
  rcdType: string | null;
  ratedCurrent: string | null;
  poles: string | null;
  description: string | null;
  quantity: number | null;
}

export interface BomRow {
  key: string;
  category: 'MCB' | 'RCD' | 'OTHER';
  label: string;
  count: number;
}

const CATEGORY_ORDER: Record<string, number> = { MCB: 0, RCD: 1, OTHER: 2 };
const CURVE_ORDER = ['B', 'C', 'D', 'K', 'Z'];
const POLES_ORDER = ['1P', '1P+N', '2P', '3P', '3P+N', '4P'];

/** "16 a" / "16A" / "16" -> "16A"; pusty -> null */
export function normalizeCurrent(value?: string | null): string | null {
  const v = (value ?? '').replace(/\s+/g, '').toUpperCase();
  if (!v) return null;
  const m = v.match(/^(\d+(?:[.,]\d+)?)A?$/);
  return m ? `${m[1].replace(',', '.')}A` : v;
}

const amps = (current: string | null) => (current ? parseFloat(current) : Number.POSITIVE_INFINITY);
const polesRank = (p: string | null) => { const i = POLES_ORDER.indexOf(p ?? ''); return i === -1 ? POLES_ORDER.length : i; };

export function buildBom(devices: BomDevice[]): BomRow[] {
  const map = new Map<string, BomRow & { _curve: number; _amps: number; _poles: number; _rcd: string }>();

  for (const d of devices) {
    const qty = d.quantity && d.quantity > 0 ? d.quantity : 1;
    const current = normalizeCurrent(d.ratedCurrent);
    const poles = d.poles?.trim().toUpperCase() || null;
    let category: 'MCB' | 'RCD' | 'OTHER';
    let key: string;
    let label: string;
    let curveRank = 0;
    let rcd = '';

    if (d.category === 'MCB') {
      category = 'MCB';
      const curve = d.mcbCurve ?? null;
      curveRank = curve ? (CURVE_ORDER.indexOf(curve) === -1 ? 99 : CURVE_ORDER.indexOf(curve)) : 100;
      // np. "Bezpiecznik B16, 1P" (bez charakterystyki: "Bezpiecznik 16A, 1P")
      const rating = curve ? `${curve}${current ? current.replace(/A$/, '') : ''}` : (current ?? 'nieokreślony');
      label = `Bezpiecznik (wyłącznik nadprądowy) ${rating}${poles ? ', ' + poles : ''}`;
      key = `MCB|${curve ?? ''}|${current ?? ''}|${poles ?? ''}`;
    } else if (d.category === 'RCD') {
      category = 'RCD';
      rcd = d.rcdType ?? '';
      label = `Różnicówka (wyłącznik różnicowoprądowy)${d.rcdType ? ' typ ' + d.rcdType : ''}${current ? ', ' + current : ''}${poles ? ', ' + poles : ''}`;
      key = `RCD|${d.rcdType ?? ''}|${current ?? ''}|${poles ?? ''}`;
    } else {
      category = 'OTHER';
      const desc = d.description?.trim() || '';
      label = `Inny aparat${desc ? ' — ' + desc : ''}${current ? ', ' + current : ''}${poles ? ', ' + poles : ''}`;
      key = `OTHER|${desc.toLowerCase()}|${current ?? ''}|${poles ?? ''}`;
    }

    const existing = map.get(key);
    if (existing) existing.count += qty;
    else map.set(key, { key, category, label, count: qty, _curve: curveRank, _amps: amps(current), _poles: polesRank(poles), _rcd: rcd });
  }

  return [...map.values()]
    .sort((a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
      || a._curve - b._curve
      || a._rcd.localeCompare(b._rcd)
      || a._amps - b._amps
      || a._poles - b._poles
      || a.label.localeCompare(b.label, 'pl'))
    .map(({ key, category, label, count }) => ({ key, category, label, count }));
}

export const totalCount = (rows: BomRow[]) => rows.reduce((sum, r) => sum + r.count, 0);

export interface BoardBom { boardId: string; name: string; moduleCount: number; rows: BomRow[]; total: number }
export interface SiteBom { boards: BoardBom[]; combined: { rows: BomRow[]; total: number }; byCategory: { mcb: number; rcd: number; other: number } }

export function buildSiteBom(boards: { id: string; name: string; moduleCount: number; devices: BomDevice[] }[]): SiteBom {
  const perBoard: BoardBom[] = boards.map((b) => {
    const rows = buildBom(b.devices);
    return { boardId: b.id, name: b.name, moduleCount: b.moduleCount, rows, total: totalCount(rows) };
  });
  const combinedRows = buildBom(boards.flatMap((b) => b.devices));
  const sum = (cat: BomRow['category']) => combinedRows.filter((r) => r.category === cat).reduce((s, r) => s + r.count, 0);
  return {
    boards: perBoard,
    combined: { rows: combinedRows, total: totalCount(combinedRows) },
    byCategory: { mcb: sum('MCB'), rcd: sum('RCD'), other: sum('OTHER') },
  };
}
