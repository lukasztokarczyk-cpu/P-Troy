'use client';

type DeviceCategory = 'RCD' | 'MCB' | 'OTHER';
type RcdType = 'AC' | 'A' | 'F' | 'B';
type McbCurve = 'B' | 'C' | 'D' | 'K' | 'Z';

interface Device {
  id: string; position: number | null; category: DeviceCategory;
  rcdType: RcdType | null; mcbCurve: McbCurve | null;
  ratedCurrent: string | null; poles: string | null;
  manufacturer: string | null; description: string | null; quantity: number;
}

const ROW_SIZE = 12; // typowa szerokość jednego rzędu szyny DIN

// Szerokość modułu na podstawie liczby biegunów — tak jak na
// fizycznej rozdzielnicy: 1P = 1 moduł, 3P+N = 4 moduły
function polesWidth(poles: string | null): number {
  switch (poles) {
    case '1P': return 1;
    case '1P+N': return 2;
    case '2P': return 2;
    case '3P': return 3;
    case '3P+N': return 4;
    default: return 1;
  }
}

function shortLabel(d: Device): string {
  if (d.category === 'MCB') return `${d.mcbCurve ?? ''}${d.ratedCurrent ?? ''}`.trim() || 'MCB';
  if (d.category === 'RCD') return `${d.rcdType ?? ''}${d.ratedCurrent ? ' ' + d.ratedCurrent : ''}`.trim() || 'RCD';
  return 'INNY';
}

function fullLabel(d: Device): string {
  const head = d.category === 'MCB'
    ? `Bezpiecznik ${shortLabel(d)}`
    : d.category === 'RCD'
    ? `Różnicówka ${shortLabel(d)}`
    : 'Aparat inny';
  const bits = [d.poles, d.manufacturer].filter(Boolean).join(', ');
  const tail = [bits, d.description].filter(Boolean).join(' — ');
  return tail ? `${head} (${tail})` : head;
}

interface Cell {
  position: number;
  device: Device | null;
  isStart: boolean;
  span: number;
}

function buildRows(moduleCount: number, devices: Device[]): Cell[][] {
  const owner: (Device | null)[] = new Array(moduleCount).fill(null);
  const isStart: boolean[] = new Array(moduleCount).fill(false);

  for (const d of devices) {
    if (!d.position) continue;
    const start = d.position - 1;
    if (start < 0 || start >= moduleCount) continue;
    isStart[start] = true;
    const width = polesWidth(d.poles);
    for (let i = start; i < Math.min(start + width, moduleCount); i++) owner[i] = d;
  }

  const cells: Cell[] = [];
  for (let i = 0; i < moduleCount; i++) {
    cells.push({
      position: i + 1,
      device: owner[i],
      isStart: isStart[i],
      span: isStart[i] && owner[i] ? polesWidth(owner[i]!.poles) : 1,
    });
  }

  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += ROW_SIZE) rows.push(cells.slice(i, i + ROW_SIZE));
  return rows;
}

const CATEGORY_STYLE: Record<DeviceCategory, string> = {
  MCB: 'bg-gradient-to-b from-zinc-300 to-zinc-400 text-zinc-900',
  RCD: 'bg-gradient-to-b from-amber-300 to-amber-400 text-amber-950',
  OTHER: 'bg-gradient-to-b from-slate-300 to-slate-400 text-slate-900',
};

export function BoardVisualization({
  moduleCount, devices, onSlotClick, onDeviceClick,
}: {
  moduleCount: number;
  devices: Device[];
  onSlotClick: (position: number) => void;
  onDeviceClick: (device: Device) => void;
}) {
  const rows = buildRows(moduleCount, devices);

  return (
    <div className="space-y-3 rounded-lg bg-zinc-950 p-3">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="rounded-md border-t-4 border-b-2 border-zinc-700 bg-gradient-to-b from-zinc-800/60 to-zinc-900/60 p-2 shadow-inner">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${ROW_SIZE}, minmax(0, 1fr))` }}>
            {row.map((cell) => {
              if (cell.device && !cell.isStart) return null; // pochłonięte przez wcześniejszy, szerszy moduł
              if (cell.device && cell.isStart) {
                const d = cell.device;
                return (
                  <button
                    key={cell.position}
                    type="button"
                    title={fullLabel(d)}
                    onClick={() => onDeviceClick(d)}
                    style={{ gridColumn: `span ${cell.span}` }}
                    className={`group relative flex flex-col items-center justify-end rounded-sm py-1.5 text-[10px] font-semibold leading-none shadow transition hover:brightness-110 active:scale-[0.97] ${CATEGORY_STYLE[d.category]}`}
                  >
                    <span className="mb-1 h-2.5 w-1.5 rounded-sm bg-zinc-900/70 group-hover:bg-zinc-900" />
                    <span className="font-mono">{shortLabel(d)}</span>
                    {d.description && (
                      <span className="mt-0.5 max-w-full truncate px-0.5 text-[8px] font-normal opacity-80">{d.description}</span>
                    )}
                  </button>
                );
              }
              return (
                <button
                  key={cell.position}
                  type="button"
                  title={`Miejsce ${cell.position} — wolne`}
                  onClick={() => onSlotClick(cell.position)}
                  className="flex items-center justify-center rounded-sm border border-dashed border-zinc-700 py-3 text-zinc-700 transition hover:border-orange-600 hover:text-orange-500"
                >
                  <span className="text-sm leading-none">+</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
