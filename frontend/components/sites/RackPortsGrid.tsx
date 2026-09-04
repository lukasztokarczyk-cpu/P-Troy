'use client';

export type PortConnectionType =
  | 'LAN_SOCKET' | 'CAMERA' | 'ACCESS_POINT' | 'SWITCH' | 'SWITCH_POE'
  | 'PATCH_PANEL' | 'ROUTER' | 'SERVER' | 'RECORDER' | 'OTHER';

export interface RackDevicePort {
  id: string;
  portNumber: number;
  connectionType: PortConnectionType | null;
  label: string | null;
  location: string | null;
  description: string | null;
}

export const PORT_CONNECTION_TYPE_LABELS: Record<PortConnectionType, string> = {
  LAN_SOCKET: 'Gniazdko LAN',
  CAMERA: 'Kamera',
  ACCESS_POINT: 'Access Point',
  SWITCH: 'Switch',
  SWITCH_POE: 'Switch PoE',
  PATCH_PANEL: 'Patch Panel',
  ROUTER: 'Router',
  SERVER: 'Serwer',
  RECORDER: 'Rejestrator',
  OTHER: 'Inne',
};

export function portSummary(p: RackDevicePort): string | null {
  if (!p.connectionType && !p.label && !p.location) return null;
  const bits = [p.connectionType ? PORT_CONNECTION_TYPE_LABELS[p.connectionType] : null, p.label, p.location].filter(Boolean);
  return bits.join(' – ');
}

/**
 * Wizualna siatka portów switcha/patch panela — porty przypisane
 * (mają połączenie) są wyraźnie oznaczone kolorem inaczej niż wolne.
 * Klik na dowolny port otwiera jego edycję.
 */
export function RackPortsGrid({ ports, onPortClick }: { ports: RackDevicePort[]; onPortClick: (port: RackDevicePort) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {ports.map((p) => {
        const summary = portSummary(p);
        const assigned = summary !== null;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPortClick(p)}
            title={summary ? `Port ${p.portNumber}: ${summary}` : `Port ${p.portNumber} — wolny`}
            className={`flex flex-col items-center justify-center rounded-sm border py-2 text-[10px] font-semibold transition hover:brightness-110 active:scale-95 ${
              assigned
                ? 'border-orange-700 bg-gradient-to-b from-orange-400 to-orange-500 text-orange-950'
                : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-orange-600 hover:text-orange-500'
            }`}
          >
            <span className="font-mono">{p.portNumber}</span>
          </button>
        );
      })}
    </div>
  );
}
