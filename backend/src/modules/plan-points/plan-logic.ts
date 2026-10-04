import { BadRequestException } from '@nestjs/common';
import {
  FRAME_ORIENTATIONS, MAX_FRAME_BOXES, labelOfKind, labelOfSubtype, labelOfFrameDevice, labelOfBoxType,
} from './plan-catalog';

export interface FrameBox {
  device: string;
  style: string;
  circuitDeviceId: string | null;
  lines: string[];
  smart: boolean;
  boxType: string | null;
}
export interface Frame {
  count: number;
  orientation: string;
  style: string;
  boxes: FrameBox[];
}

export const DEFAULT_FRAME_STYLE = '';

function cleanLines(lines?: string[] | null): string[] {
  return [...new Set((lines ?? []).map((l) => l.trim()).filter(Boolean))];
}

/**
 * Doprowadza ramkę do spójnej postaci: liczba puszek = count (dopełnia
 * domyślnymi, ucina nadmiar), czyste linie, brak duplikatów linii.
 */
// Wejście (z DTO lub z bazy) ma pola opcjonalne — wyjście jest zawsze kompletne
export interface FrameInput {
  count?: number;
  orientation?: string;
  style?: string;
  boxes?: Partial<FrameBox>[];
}

export function normalizeFrame(input?: FrameInput | null): Frame {
  const count = Math.min(MAX_FRAME_BOXES, Math.max(1, Math.round(input?.count ?? input?.boxes?.length ?? 1)));
  const orientation = (FRAME_ORIENTATIONS as readonly string[]).includes(input?.orientation ?? '')
    ? (input!.orientation as string)
    : 'HORIZONTAL';
  const style = (input?.style ?? DEFAULT_FRAME_STYLE).trim();
  const boxes: FrameBox[] = [];
  for (let i = 0; i < count; i++) {
    const b = input?.boxes?.[i];
    boxes.push({
      device: b?.device ?? 'switch_single',
      style: (b?.style ?? '').trim(),
      circuitDeviceId: b?.circuitDeviceId ?? null,
      lines: cleanLines(b?.lines),
      smart: !!b?.smart,
      boxType: b?.boxType ?? null,
    });
  }
  return { count, orientation, style, boxes };
}

/** Wszystkie id obwodów użyte w punkcie (samym i jego puszkach) — do kontroli, że należą do budowy. */
export function circuitIdsOf(p: { circuitDeviceId?: string | null; frame?: FrameInput | null }): string[] {
  const ids = new Set<string>();
  if (p.circuitDeviceId) ids.add(p.circuitDeviceId);
  for (const b of p.frame?.boxes ?? []) if (b.circuitDeviceId) ids.add(b.circuitDeviceId);
  return [...ids];
}

export function assertCoordinates(x: number, y: number) {
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
    throw new BadRequestException('Punkt musi leżeć na planie');
  }
}

// ----------------------------------------------------------------------
// Zestawienie (te same liczby trafiają do panelu w edytorze i do PDF)
// ----------------------------------------------------------------------

export interface SummaryPoint {
  kind: string;
  subtype: string | null;
  boxType: string | null;
  circuitDeviceId: string | null;
  frame: FrameInput | null;
}
export interface SummaryRow { label: string; count: number }
export interface PlanSummary {
  total: number;
  points: SummaryRow[];   // punkty wg rodzaju/podtypu
  frames: SummaryRow[];   // ramki wg liczby puszek, układu i stylu
  devices: SummaryRow[];  // aparaty/osprzęt w puszkach ramek
  boxes: SummaryRow[];    // puszki wg typu (z ramek i z punktów)
  noCircuit: number;      // punkty/puszki bez przypisanego obwodu (do uzupełnienia)
}

const orientationLabel = (o?: string) => (o === 'VERTICAL' ? 'pionowa' : 'pozioma');

function add(map: Map<string, number>, label: string, n = 1) {
  map.set(label, (map.get(label) ?? 0) + n);
}
const rows = (map: Map<string, number>): SummaryRow[] =>
  [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label, 'pl'));

export function summarize(
  points: SummaryPoint[],
  subtypeLabelOf: (kind: string, subtype?: string | null) => string = labelOfSubtype,
): PlanSummary {
  const pts = new Map<string, number>();
  const frames = new Map<string, number>();
  const devices = new Map<string, number>();
  const boxes = new Map<string, number>();
  let noCircuit = 0;

  for (const p of points) {
    if (p.kind === 'FRAME') {
      const f = normalizeFrame(p.frame);
      add(frames, `Ramka ${f.count}-krotna ${orientationLabel(f.orientation)}${f.style ? ' ' + f.style : ''}`);
      for (const b of f.boxes) {
        add(devices, `${labelOfFrameDevice(b.device)}${b.style ? ' (' + b.style + ')' : ''}`);
        add(boxes, labelOfBoxType(b.boxType) || 'Puszka — typ nieokreślony');
        if (!b.circuitDeviceId && !['blank', 'lan', 'tv'].includes(b.device)) noCircuit++;
      }
    } else {
      const sub = subtypeLabelOf(p.kind, p.subtype);
      add(pts, sub ? `${labelOfKind(p.kind)} — ${sub}` : labelOfKind(p.kind));
      if (p.boxType) add(boxes, labelOfBoxType(p.boxType));
      if (!p.circuitDeviceId && ['SOCKET', 'LIGHT', 'SHADING'].includes(p.kind)) noCircuit++;
    }
  }
  return { total: points.length, points: rows(pts), frames: rows(frames), devices: rows(devices), boxes: rows(boxes), noCircuit };
}
