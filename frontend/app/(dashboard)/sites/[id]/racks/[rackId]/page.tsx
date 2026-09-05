'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, Plus, Trash2, Pencil, Server, X, Printer } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';
import { LabelPrintModal, type LabelTargetType } from '@/components/labels/LabelPrintModal';
import {
  RackVisualization, RACK_DEVICE_TYPE_LABELS, PORTED_DEVICE_TYPES,
  type RackDeviceLite, type RackDeviceType,
} from '@/components/sites/RackVisualization';
import {
  RackPortsGrid, PORT_CONNECTION_TYPE_LABELS, portSummary,
  type RackDevicePort, type PortConnectionType,
} from '@/components/sites/RackPortsGrid';

interface RackDetail {
  id: string;
  name: string;
  unitsCount: number | null;
  manufacturer: string | null;
  location: string | null;
  description: string | null;
  devices: RackDeviceLite[];
}

const DEVICE_TYPE_OPTIONS: RackDeviceType[] = [
  'SWITCH', 'SWITCH_POE', 'PATCH_PANEL', 'ROUTER', 'FIREWALL', 'SERVER', 'UPS', 'RECORDER', 'OTHER',
];
const PORT_COUNT_PRESETS = [8, 16, 24, 48];

export default function RackDetailPage() {
  const params = useParams();
  const siteId = params.id as string;
  const rackId = params.rackId as string;
  const { isPrivileged } = useAuth();

  const [rack, setRack] = useState<RackDetail | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [printModal, setPrintModal] = useState<{ targetType: LabelTargetType; recordIds: string[]; contextLabel: string } | null>(null);

  const loadRack = () => {
    apiClient<RackDetail>(`/api/racks/${rackId}`).then(setRack).catch(() => setRack(null));
  };
  useEffect(() => { loadRack(); }, [rackId]);

  const selectedDevice = rack?.devices.find((d) => d.id === selectedDeviceId) ?? null;

  // ---- Modal: urządzenie (dodaj/edytuj) ----
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    name: '', type: 'SWITCH' as RackDeviceType, purpose: '', startUnit: '', unitsSpan: 1, portsCount: '', description: '',
  });
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);

  const openDeviceModal = (device?: RackDeviceLite, presetStartUnit?: number) => {
    setEditingDeviceId(device?.id ?? null);
    setDeviceForm({
      name: device?.name ?? '',
      type: device?.type ?? 'SWITCH',
      purpose: device?.purpose ?? '',
      startUnit: (device?.startUnit ?? presetStartUnit)?.toString() ?? '',
      unitsSpan: device?.unitsSpan ?? 1,
      portsCount: device?.portsCount?.toString() ?? '',
      description: device?.description ?? '',
    });
    setDeviceModalOpen(true);
  };

  const isPortedType = PORTED_DEVICE_TYPES.includes(deviceForm.type);

  const handleDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceSubmitting(true);
    const body = {
      name: deviceForm.name,
      type: deviceForm.type,
      purpose: deviceForm.purpose || undefined,
      startUnit: Number(deviceForm.startUnit),
      unitsSpan: deviceForm.unitsSpan,
      portsCount: isPortedType && deviceForm.portsCount ? Number(deviceForm.portsCount) : undefined,
      description: deviceForm.description || undefined,
    };
    try {
      if (editingDeviceId) {
        await submitDeviceUpdate(editingDeviceId, body);
      } else {
        await apiClient(`/api/racks/${rackId}/devices`, { method: 'POST', body });
      }
      setDeviceModalOpen(false);
      loadRack();
    } catch (err: any) { alert(err.message); } finally { setDeviceSubmitting(false); }
  };

  // Aktualizacja urządzenia — jeśli serwer ostrzeże (409, bo usuwane
  // porty mają już przypisane informacje), pytamy o potwierdzenie i
  // ponawiamy żądanie z force=true.
  const submitDeviceUpdate = async (id: string, body: any) => {
    try {
      await apiClient(`/api/rack-devices/${id}`, { method: 'PATCH', body });
    } catch (err: any) {
      if (String(err.message).includes('przypisane informacje') && window.confirm(`${err.message}\n\nCzy na pewno usunąć te porty wraz z przypisanymi informacjami?`)) {
        await apiClient(`/api/rack-devices/${id}?force=true`, { method: 'PATCH', body });
      } else {
        throw err;
      }
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!window.confirm('Usunąć to urządzenie wraz z jego portami?')) return;
    await apiClient(`/api/rack-devices/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    setSelectedDeviceId(null);
    loadRack();
  };

  // ---- Modal: port ----
  const [portModalOpen, setPortModalOpen] = useState(false);
  const [editingPort, setEditingPort] = useState<RackDevicePort | null>(null);
  const [portForm, setPortForm] = useState({ connectionType: '' as PortConnectionType | '', label: '', location: '', description: '' });
  const [portSubmitting, setPortSubmitting] = useState(false);

  const openPortModal = (port: RackDevicePort) => {
    setEditingPort(port);
    setPortForm({
      connectionType: port.connectionType ?? '',
      label: port.label ?? '',
      location: port.location ?? '',
      description: port.description ?? '',
    });
    setPortModalOpen(true);
  };

  const handlePortSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPort) return;
    setPortSubmitting(true);
    try {
      await apiClient(`/api/rack-device-ports/${editingPort.id}`, {
        method: 'PATCH',
        body: {
          connectionType: portForm.connectionType || null,
          label: portForm.label || null,
          location: portForm.location || null,
          description: portForm.description || null,
        },
      });
      setPortModalOpen(false);
      loadRack();
    } catch (err: any) { alert(err.message); } finally { setPortSubmitting(false); }
  };

  const handleClearPort = async () => {
    if (!editingPort) return;
    if (!window.confirm('Usunąć przypisanie tego portu?')) return;
    setPortSubmitting(true);
    try {
      await apiClient(`/api/rack-device-ports/${editingPort.id}`, {
        method: 'PATCH',
        body: { connectionType: null, label: null, location: null, description: null },
      });
      setPortModalOpen(false);
      loadRack();
    } catch (err: any) { alert(err.message); } finally { setPortSubmitting(false); }
  };

  if (rack === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <Link href={`/sites/${siteId}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="h-4 w-4" /> Wróć do budowy
      </Link>

      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Server className="h-5 w-5 text-orange-500" /> {rack.name}
          </h1>
          <button
            onClick={() => setPrintModal({ targetType: 'RACK', recordIds: [rack.id], contextLabel: rack.name })}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-orange-600 hover:text-orange-500"
          >
            <Printer className="h-3.5 w-3.5" /> Drukuj etykietę
          </button>
        </div>
        <p className="mt-0.5 text-sm text-zinc-500">
          {[rack.unitsCount ? `${rack.unitsCount}U` : null, rack.manufacturer, rack.location].filter(Boolean).join(' · ') || 'Brak dodatkowych danych'}
        </p>
        {rack.description && <p className="mt-1 text-sm text-zinc-400">{rack.description}</p>}
      </div>

      {rack.unitsCount ? (
        <RackVisualization
          unitsCount={rack.unitsCount}
          devices={rack.devices}
          onSlotClick={(unit) => openDeviceModal(undefined, unit)}
          onDeviceClick={(d) => setSelectedDeviceId(d.id)}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
          Ta szafa nie ma określonej liczby U — edytuj szafę, aby dodać wysokość i zobaczyć wizualizację pozycji.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openDeviceModal()} className="bg-orange-600 text-white hover:bg-orange-500">
          <Plus className="mr-1 h-4 w-4" /> Dodaj urządzenie
        </Button>
        {rack.devices.length > 0 && (
          <button
            onClick={() => setPrintModal({ targetType: 'RACK_DEVICE', recordIds: rack.devices.map((d) => d.id), contextLabel: `${rack.devices.length} urządzeń w szafie ${rack.name}` })}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-orange-600 hover:text-orange-500"
          >
            <Printer className="h-4 w-4" /> Drukuj etykiety wszystkich urządzeń
          </button>
        )}
      </div>

      {/* ---- Panel wybranego urządzenia ---- */}
      {selectedDevice && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <p className="font-semibold text-zinc-100">{selectedDevice.name}</p>
              <p className="text-xs text-zinc-500">
                {RACK_DEVICE_TYPE_LABELS[selectedDevice.type]} · U{selectedDevice.startUnit}
                {selectedDevice.unitsSpan > 1 ? `–${selectedDevice.startUnit - selectedDevice.unitsSpan + 1}` : ''}
                {selectedDevice.purpose ? ` · ${selectedDevice.purpose}` : ''}
              </p>
              {selectedDevice.description && <p className="mt-1 text-xs text-zinc-600">{selectedDevice.description}</p>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => setPrintModal({ targetType: 'RACK_DEVICE', recordIds: [selectedDevice.id], contextLabel: selectedDevice.name })} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Printer className="h-4 w-4" /></button>
              <button onClick={() => openDeviceModal(selectedDevice)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Pencil className="h-4 w-4" /></button>
              {isPrivileged && <button onClick={() => handleDeleteDevice(selectedDevice.id)} className="rounded p-1.5 text-zinc-500 hover:bg-red-950 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
              <button onClick={() => setSelectedDeviceId(null)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {PORTED_DEVICE_TYPES.includes(selectedDevice.type) && selectedDevice.ports.length > 0 && (
            <div className="mt-3 border-t border-zinc-800 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400">{selectedDevice.ports.length} portów — kliknij, aby edytować</p>
                <button
                  onClick={() => setPrintModal({ targetType: 'RACK_DEVICE_PORT', recordIds: selectedDevice.ports.map((p) => p.id), contextLabel: `${selectedDevice.ports.length} portów — ${selectedDevice.name}` })}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-500"
                >
                  <Printer className="h-3.5 w-3.5" /> Drukuj etykiety wszystkich portów
                </button>
              </div>
              <RackPortsGrid ports={selectedDevice.ports} onPortClick={openPortModal} />
            </div>
          )}
        </div>
      )}

      {/* ---- MODAL: Urządzenie ---- */}
      <Modal open={deviceModalOpen} onClose={() => setDeviceModalOpen(false)} title={editingDeviceId ? 'Edytuj urządzenie' : 'Nowe urządzenie w szafie'}>
        <form onSubmit={handleDeviceSubmit}>
          <label className={labelClass}>Nazwa</label>
          <input required value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })} placeholder="np. Switch 48 portów" className={fieldClass} />

          <label className={labelClass}>Typ urządzenia</label>
          <select value={deviceForm.type} onChange={(e) => setDeviceForm({ ...deviceForm, type: e.target.value as RackDeviceType })} className={fieldClass}>
            {DEVICE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{RACK_DEVICE_TYPE_LABELS[t]}</option>)}
          </select>

          <label className={labelClass}>Przeznaczenie (opcjonalnie)</label>
          <input value={deviceForm.purpose} onChange={(e) => setDeviceForm({ ...deviceForm, purpose: e.target.value })} placeholder="np. Sieć LAN — pokoje hotelowe" className={fieldClass} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Pozycja U (górna)</label>
              <input required type="number" min={1} value={deviceForm.startUnit} onChange={(e) => setDeviceForm({ ...deviceForm, startUnit: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Liczba zajmowanych U</label>
              <input required type="number" min={1} value={deviceForm.unitsSpan} onChange={(e) => setDeviceForm({ ...deviceForm, unitsSpan: Number(e.target.value) })} className={fieldClass} />
            </div>
          </div>

          {isPortedType && (
            <>
              <label className={labelClass}>Liczba portów{editingDeviceId ? '' : ' (opcjonalnie)'}</label>
              <input list="port-count-presets" type="number" min={1} value={deviceForm.portsCount} onChange={(e) => setDeviceForm({ ...deviceForm, portsCount: e.target.value })} placeholder="np. 24" className={fieldClass} />
              <datalist id="port-count-presets">{PORT_COUNT_PRESETS.map((n) => <option key={n} value={n} />)}</datalist>
              {editingDeviceId && <p className="mt-1 text-xs text-zinc-600">Zmniejszenie liczby portów usunie porty o najwyższych numerach — jeśli mają przypisane dane, dostaniesz prośbę o potwierdzenie.</p>}
            </>
          )}

          <label className={labelClass}>Opis / uwagi (opcjonalnie)</label>
          <textarea rows={2} value={deviceForm.description} onChange={(e) => setDeviceForm({ ...deviceForm, description: e.target.value })} className={fieldClass} />

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeviceModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={deviceSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {deviceSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- MODAL: Port ---- */}
      <Modal open={portModalOpen} onClose={() => setPortModalOpen(false)} title={editingPort ? `Port ${editingPort.portNumber}` : 'Port'}>
        <form onSubmit={handlePortSubmit}>
          <label className={labelClass}>Typ podłączenia</label>
          <select value={portForm.connectionType} onChange={(e) => setPortForm({ ...portForm, connectionType: e.target.value as PortConnectionType | '' })} className={fieldClass}>
            <option value="">— nie wybrano —</option>
            {Object.entries(PORT_CONNECTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <label className={labelClass}>Nazwa / przeznaczenie (opcjonalnie)</label>
          <input value={portForm.label} onChange={(e) => setPortForm({ ...portForm, label: e.target.value })} placeholder="np. Gniazdko internetowe" className={fieldClass} />

          <label className={labelClass}>Lokalizacja (opcjonalnie)</label>
          <input value={portForm.location} onChange={(e) => setPortForm({ ...portForm, location: e.target.value })} placeholder="np. Pokój nr 15" className={fieldClass} />

          <label className={labelClass}>Opis / uwagi (opcjonalnie)</label>
          <textarea rows={2} value={portForm.description} onChange={(e) => setPortForm({ ...portForm, description: e.target.value })} className={fieldClass} />

          <div className="mt-5 flex items-center justify-between gap-2">
            {editingPort && portSummary(editingPort) && (
              <Button type="button" variant="outline" onClick={handleClearPort} disabled={portSubmitting} className="border-red-800 text-red-400 hover:bg-red-950">
                Usuń przypisanie
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {editingPort && (
                <button
                  type="button"
                  onClick={() => { setPortModalOpen(false); setPrintModal({ targetType: 'RACK_DEVICE_PORT', recordIds: [editingPort.id], contextLabel: `Port ${editingPort.portNumber}` }); }}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-orange-600 hover:text-orange-500"
                >
                  <Printer className="h-4 w-4" /> Etykieta
                </button>
              )}
              <Button type="button" variant="outline" onClick={() => setPortModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
              <Button type="submit" disabled={portSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
                {portSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {printModal && (
        <LabelPrintModal
          open={true}
          onClose={() => setPrintModal(null)}
          targetType={printModal.targetType}
          recordIds={printModal.recordIds}
          contextLabel={printModal.contextLabel}
        />
      )}
    </div>
  );
}
