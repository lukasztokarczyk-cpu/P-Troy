'use client';

export type RackDeviceType =
  | 'SWITCH' | 'SWITCH_POE' | 'PATCH_PANEL' | 'ROUTER' | 'FIREWALL'
  | 'SERVER' | 'UPS' | 'RECORDER' | 'OTHER';

export type PortConnectionType =
  | 'LAN_SOCKET' | 'CAMERA' | 'ACCESS_POINT' | 'SWITCH' | 'SWITCH_POE'
  | 'PATCH_PANEL' | 'ROUTER' | 'SERVER' | 'RECORDER' | 'OTHER';

export interface RackDevicePortLite {
  id: string;
  portNumber: number;
  connectionType: PortConnectionType | null;
  label: string | null;
  location: string | null;
  description: string | null;
}

export interface RackDeviceLite {
  id: string;
  name: string;
  type: RackDeviceType;
  purpose: string | null;
  startUnit: number;
  unitsSpan: number;
  portsCount: number | null;
  description: string | null;
  ports: RackDevicePortLite[];
}

export const RACK_DEVICE_TYPE_LABELS: Record<RackDeviceType, string> = {
  SWITCH: 'Switch',
  SWITCH_POE: 'Switch PoE',
  PATCH_PANEL: 'Patch Panel',
  ROUTER: 'Router',
  FIREWALL: 'Firewall',
  SERVER: 'Serwer',
  UPS: 'UPS',
  RECORDER: 'Rejestrator',
  OTHER: 'Inne',
};

// Typy, dla których zarządzamy portami — switche i patch panele
export const PORTED_DEVICE_TYPES: RackDeviceType[] = ['SWITCH', 'SWITCH_POE', 'PATCH_PANEL'];

const TYPE_STYLE: Record<RackDeviceType, string> = {
  SWITCH: 'bg-gradient-to-r from-zinc-300 to-zinc-400 text-zinc-900',
  SWITCH_POE: 'bg-gradient-to-r from-teal-300 to-teal-400 text-teal-950',
  PATCH_PANEL: 'bg-gradient-to-r from-sky-300 to-sky-400 text-sky-950',
  ROUTER: 'bg-gradient-to-r from-violet-300 to-violet-400 text-violet-950',
  FIREWALL: 'bg-gradient-to-r from-red-300 to-red-400 text-red-950',
  SERVER: 'bg-gradient-to-r from-slate-300 to-slate-400 text-slate-900',
  UPS: 'bg-gradient-to-r from-amber-300 to-amber-400 text-amber-950',
  RECORDER: 'bg-gradient-to-r from-cyan-300 to-cyan-400 text-cyan-950',
  OTHER: 'bg-gradient-to-r from-zinc-400 to-zinc-500 text-zinc-950',
};

function deviceLabel(d: RackDeviceLite): string {
  const head = `${RACK_DEVICE_TYPE_LABELS[d.type]} — ${d.name}`;
  return d.purpose ? `${head} (${d.purpose})` : head;
}

interface Row {
  unit: number;
  device: RackDeviceLite | null;
  isTop: boolean; // czy to najwyższy (pierwszy renderowany) wiersz danego urządzenia
}

function buildRows(unitsCount: number, devices: RackDeviceLite[]): Row[] {
  const owner: (RackDeviceLite | null)[] = new Array(unitsCount + 1).fill(null); // index = numer U
  const isTop: boolean[] = new Array(unitsCount + 1).fill(false);

  for (const d of devices) {
    const top = d.startUnit;
    const bottom = d.startUnit - d.unitsSpan + 1;
    isTop[top] = true;
    for (let u = Math.max(bottom, 1); u <= Math.min(top, unitsCount); u++) owner[u] = d;
  }

  const rows: Row[] = [];
  for (let u = unitsCount; u >= 1; u--) {
    rows.push({ unit: u, device: owner[u], isTop: isTop[u] });
  }
  return rows;
}

/**
 * Pionowa wizualizacja szafy rack — pozycje U od góry (najwyższy numer)
 * do dołu (U1), imitująca fizyczny układ szafy. Puste miejsce = przerywana
 * ramka z "+", klik otwiera dodawanie urządzenia z ustawionym numerem U.
 * Zajęte miejsce = kolorowy blok (kolor wg typu urządzenia) rozciągnięty
 * na tyle wierszy, ile jednostek U zajmuje — klik otwiera edycję/porty.
 */
export function RackVisualization({
  unitsCount, devices, onSlotClick, onDeviceClick,
}: {
  unitsCount: number;
  devices: RackDeviceLite[];
  onSlotClick: (unit: number) => void;
  onDeviceClick: (device: RackDeviceLite) => void;
}) {
  const rows = buildRows(unitsCount, devices);

  return (
    <div className="space-y-0.5 rounded-lg border-x-4 border-zinc-700 bg-zinc-950 p-2">
      {rows.map((row) => {
        if (row.device && !row.isTop) return null; // wchłonięte przez blok powyżej

        if (row.device) {
          const d = row.device;
          const bottom = Math.max(d.startUnit - d.unitsSpan + 1, 1);
          const span = d.startUnit - bottom + 1;
          return (
            <button
              key={row.unit}
              type="button"
              onClick={() => onDeviceClick(d)}
              title={deviceLabel(d)}
              className={`group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left shadow transition hover:brightness-110 active:scale-[0.99] ${TYPE_STYLE[d.type]}`}
              style={{ minHeight: `${span * 1.6}rem` }}
            >
              <span className="w-9 shrink-0 font-mono text-[10px] opacity-70">
                U{d.startUnit}{span > 1 ? `–${bottom}` : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold leading-tight">{d.name}</span>
                <span className="block truncate text-[10px] font-normal leading-tight opacity-80">
                  {RACK_DEVICE_TYPE_LABELS[d.type]}
                  {d.purpose ? ` — ${d.purpose}` : ''}
                  {d.portsCount ? ` · ${d.portsCount} portów` : ''}
                </span>
              </span>
            </button>
          );
        }

        return (
          <button
            key={row.unit}
            type="button"
            onClick={() => onSlotClick(row.unit)}
            title={`U${row.unit} — wolne`}
            className="flex w-full items-center gap-2 rounded-sm border border-dashed border-zinc-700 px-2 py-1 text-zinc-700 transition hover:border-orange-600 hover:text-orange-500"
          >
            <span className="w-9 shrink-0 font-mono text-[10px]">U{row.unit}</span>
            <span className="text-xs leading-none">+</span>
          </button>
        );
      })}
    </div>
  );
}
