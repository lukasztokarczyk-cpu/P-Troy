'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, ChevronDown, ChevronRight, Trash2, Pencil, Zap, Server, Flame } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';
import { BoardVisualization } from '@/components/sites/BoardVisualization';

type DeviceCategory = 'RCD' | 'MCB' | 'OTHER';
type RcdType = 'AC' | 'A' | 'F' | 'B';
type McbCurve = 'B' | 'C' | 'D' | 'K' | 'Z';

interface Device {
  id: string; position: number | null; category: DeviceCategory;
  rcdType: RcdType | null; mcbCurve: McbCurve | null;
  ratedCurrent: string | null; poles: string | null;
  manufacturer: string | null; description: string | null; quantity: number;
}
interface Board {
  id: string; name: string; moduleCount: number;
  manufacturer: string | null; description: string | null; devices: Device[];
}
interface Rack {
  id: string; name: string; unitsCount: number | null;
  manufacturer: string | null; location: string | null; description: string | null;
}
interface FireSafetyItem {
  id: string; type: string; location: string | null; description: string | null;
  lastInspectionDate: string | null; nextInspectionDate: string | null; certificateNumber: string | null;
}

const MODULE_COUNT_PRESETS = [8, 12, 18, 24, 36, 48, 54, 72, 96, 100];
const MANUFACTURER_PRESETS = ['Hager', 'Legrand', 'Schneider Electric', 'Eaton', 'ABB', 'Noark', 'Siemens'];
const RATED_CURRENT_PRESETS = ['6A', '10A', '13A', '16A', '20A', '25A', '32A', '40A', '50A', '63A'];
const POLES_PRESETS = ['1P', '1P+N', '2P', '3P', '3P+N'];
const FIRE_SAFETY_TYPE_PRESETS = ['Gaśnica', 'Czujka dymu', 'Hydrant', 'Oświetlenie awaryjne', 'Drzwi ppoż', 'Inne'];

const RCD_TYPE_LABELS: Record<RcdType, string> = { AC: 'AC', A: 'A', F: 'F', B: 'B' };
const MCB_CURVE_LABELS: Record<McbCurve, string> = { B: 'B', C: 'C', D: 'D', K: 'K', Z: 'Z' };

// Pole tekstowe z podpowiedziami (datalist) — pozwala wybrać typową
// wartość z listy, ale zawsze dopuszcza wpisanie własnej (zgodnie z
// wymogiem: "daj listę do wyboru, ale też możliwość tworzenia własnych").
function SuggestField({
  value, onChange, options, placeholder, listId,
}: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; listId: string }) {
  return (
    <>
      <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

function deviceLabel(d: Device): string {
  const parts: string[] = [];
  if (d.category === 'MCB' && d.mcbCurve) parts.push(`${d.mcbCurve}${d.ratedCurrent ?? ''}`);
  if (d.category === 'RCD' && d.rcdType) parts.push(`Różn. ${d.rcdType}${d.ratedCurrent ? ' ' + d.ratedCurrent : ''}`);
  if (d.category === 'OTHER') parts.push('Inny aparat');
  if (d.poles) parts.push(d.poles);
  if (d.manufacturer) parts.push(d.manufacturer);
  const head = parts.join(' ') || (d.category === 'MCB' ? 'Bezpiecznik' : d.category === 'RCD' ? 'Różnicówka' : 'Aparat');
  return d.description ? `${head} — ${d.description}` : head;
}

export function DistributionBoardsTab({ siteId, isPrivileged }: { siteId: string; isPrivileged: boolean }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [racks, setRacks] = useState<Rack[] | null>(null);
  const [fireSafety, setFireSafety] = useState<FireSafetyItem[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadAll = () => {
    apiClient<Board[]>(`/api/sites/${siteId}/distribution-boards`).then(setBoards).catch(() => setBoards([]));
    apiClient<Rack[]>(`/api/sites/${siteId}/racks`).then(setRacks).catch(() => setRacks([]));
    apiClient<FireSafetyItem[]>(`/api/sites/${siteId}/fire-safety-items`).then(setFireSafety).catch(() => setFireSafety([]));
  };
  useEffect(() => { loadAll(); }, [siteId]);

  // ---- Modal: Rozdzielnia ----
  const [boardModalOpen, setBoardModalOpen] = useState(false);
  const [boardForm, setBoardForm] = useState({ name: '', moduleCount: 24, manufacturer: '', description: '' });
  const [boardSubmitting, setBoardSubmitting] = useState(false);

  const openBoardModal = () => { setBoardForm({ name: '', moduleCount: 24, manufacturer: '', description: '' }); setBoardModalOpen(true); };
  const handleBoardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBoardSubmitting(true);
    try {
      await apiClient(`/api/sites/${siteId}/distribution-boards`, { method: 'POST', body: boardForm });
      setBoardModalOpen(false);
      loadAll();
    } catch (err: any) { alert(err.message); } finally { setBoardSubmitting(false); }
  };
  const handleDeleteBoard = async (id: string) => {
    if (!window.confirm('Usunąć tę rozdzielnię wraz ze wszystkimi aparatami?')) return;
    await apiClient(`/api/distribution-boards/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadAll();
  };

  // ---- Modal: Aparat ----
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [deviceBoardId, setDeviceBoardId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    position: '', category: 'MCB' as DeviceCategory, rcdType: 'AC' as RcdType, mcbCurve: 'B' as McbCurve,
    ratedCurrent: '', poles: '1P+N', manufacturer: '', description: '', quantity: 1,
  });
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);

  const openDeviceModal = (boardId: string, device?: Device, presetPosition?: number) => {
    setDeviceBoardId(boardId);
    setEditingDeviceId(device?.id ?? null);
    setDeviceForm({
      position: device?.position?.toString() ?? presetPosition?.toString() ?? '',
      category: device?.category ?? 'MCB',
      rcdType: device?.rcdType ?? 'AC',
      mcbCurve: device?.mcbCurve ?? 'B',
      ratedCurrent: device?.ratedCurrent ?? '',
      poles: device?.poles ?? '1P+N',
      manufacturer: device?.manufacturer ?? '',
      description: device?.description ?? '',
      quantity: device?.quantity ?? 1,
    });
    setDeviceModalOpen(true);
  };
  const handleDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceSubmitting(true);
    const body = {
      position: deviceForm.position ? Number(deviceForm.position) : undefined,
      category: deviceForm.category,
      rcdType: deviceForm.category === 'RCD' ? deviceForm.rcdType : undefined,
      mcbCurve: deviceForm.category === 'MCB' ? deviceForm.mcbCurve : undefined,
      ratedCurrent: deviceForm.ratedCurrent || undefined,
      poles: deviceForm.poles || undefined,
      manufacturer: deviceForm.manufacturer || undefined,
      description: deviceForm.description || undefined,
      quantity: deviceForm.quantity,
    };
    try {
      if (editingDeviceId) {
        await apiClient(`/api/distribution-board-devices/${editingDeviceId}`, { method: 'PATCH', body });
      } else {
        await apiClient(`/api/distribution-boards/${deviceBoardId}/devices`, { method: 'POST', body });
      }
      setDeviceModalOpen(false);
      loadAll();
    } catch (err: any) { alert(err.message); } finally { setDeviceSubmitting(false); }
  };
  const handleDeleteDevice = async (id: string) => {
    if (!window.confirm('Usunąć ten aparat?')) return;
    await apiClient(`/api/distribution-board-devices/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadAll();
  };

  // ---- Modal: Szafa rack ----
  const [rackModalOpen, setRackModalOpen] = useState(false);
  const [rackForm, setRackForm] = useState({ name: '', unitsCount: '', manufacturer: '', location: '', description: '' });
  const [rackSubmitting, setRackSubmitting] = useState(false);
  const openRackModal = () => { setRackForm({ name: '', unitsCount: '', manufacturer: '', location: '', description: '' }); setRackModalOpen(true); };
  const handleRackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRackSubmitting(true);
    try {
      await apiClient(`/api/sites/${siteId}/racks`, {
        method: 'POST',
        body: { ...rackForm, unitsCount: rackForm.unitsCount ? Number(rackForm.unitsCount) : undefined },
      });
      setRackModalOpen(false);
      loadAll();
    } catch (err: any) { alert(err.message); } finally { setRackSubmitting(false); }
  };
  const handleDeleteRack = async (id: string) => {
    if (!window.confirm('Usunąć tę szafę rack?')) return;
    await apiClient(`/api/racks/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadAll();
  };

  // ---- Modal: PPOŻ ----
  const [fireModalOpen, setFireModalOpen] = useState(false);
  const [fireForm, setFireForm] = useState({
    type: 'Gaśnica', location: '', description: '', lastInspectionDate: '', nextInspectionDate: '', certificateNumber: '',
  });
  const [fireSubmitting, setFireSubmitting] = useState(false);
  const openFireModal = () => {
    setFireForm({ type: 'Gaśnica', location: '', description: '', lastInspectionDate: '', nextInspectionDate: '', certificateNumber: '' });
    setFireModalOpen(true);
  };
  const handleFireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFireSubmitting(true);
    try {
      await apiClient(`/api/sites/${siteId}/fire-safety-items`, {
        method: 'POST',
        body: {
          ...fireForm,
          lastInspectionDate: fireForm.lastInspectionDate || undefined,
          nextInspectionDate: fireForm.nextInspectionDate || undefined,
        },
      });
      setFireModalOpen(false);
      loadAll();
    } catch (err: any) { alert(err.message); } finally { setFireSubmitting(false); }
  };
  const handleDeleteFire = async (id: string) => {
    if (!window.confirm('Usunąć ten element PPOŻ?')) return;
    await apiClient(`/api/fire-safety-items/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadAll();
  };

  if (boards === null || racks === null || fireSafety === null) {
    return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* ---- ROZDZIELNIE ---- */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200"><Zap className="h-4 w-4 text-orange-500" /> Rozdzielnie</h3>
          <Button size="sm" onClick={openBoardModal} className="bg-orange-600 text-white hover:bg-orange-500"><Plus className="mr-1 h-3.5 w-3.5" /> Nowa rozdzielnia</Button>
        </div>
        {boards.length === 0 && <p className="text-sm text-zinc-500">Brak rozdzielni.</p>}
        <div className="space-y-2">
          {boards.map((b) => (
            <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900">
              <button onClick={() => setExpanded({ ...expanded, [b.id]: !expanded[b.id] })} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  {expanded[b.id] ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
                  <span className="font-medium text-zinc-100">{b.name}</span>
                  <span className="text-xs text-zinc-500">{b.moduleCount} modułów{b.manufacturer ? ` · ${b.manufacturer}` : ''}</span>
                </div>
                <span className="text-xs text-zinc-600">{b.devices.length} aparatów</span>
              </button>
              {expanded[b.id] && (
                <div className="border-t border-zinc-800 px-4 py-3">
                  {b.description && <p className="mb-3 text-xs text-zinc-500">{b.description}</p>}

                  <BoardVisualization
                    moduleCount={b.moduleCount}
                    devices={b.devices}
                    onSlotClick={(position) => openDeviceModal(b.id, undefined, position)}
                    onDeviceClick={(d) => openDeviceModal(b.id, d)}
                  />

                  {/* Kompaktowy rejestr — aparaty bez przypisanego miejsca
                      (niewidoczne w siatce) oraz szybki dostęp do usuwania */}
                  {b.devices.some((d) => !d.position) && (
                    <div className="mt-3 space-y-1">
                      {b.devices.filter((d) => !d.position).map((d) => (
                        <div key={d.id} className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2 text-sm">
                          <span className="text-zinc-200">
                            {deviceLabel(d)}
                            {d.quantity > 1 && <span className="ml-1 text-zinc-500">×{d.quantity}</span>}
                            <span className="ml-2 text-xs text-zinc-600">(bez przypisanego miejsca)</span>
                          </span>
                          <div className="flex gap-1">
                            <button onClick={() => openDeviceModal(b.id, d)} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Pencil className="h-3.5 w-3.5" /></button>
                            {isPrivileged && <button onClick={() => handleDeleteDevice(d.id)} className="rounded p-1 text-zinc-500 hover:bg-red-950 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex justify-between">
                    <Button size="sm" variant="outline" onClick={() => openDeviceModal(b.id)} className="border-zinc-700 text-zinc-300"><Plus className="mr-1 h-3.5 w-3.5" /> Dodaj aparat</Button>
                    {isPrivileged && <Button size="sm" variant="outline" onClick={() => handleDeleteBoard(b.id)} className="border-red-800 text-red-400 hover:bg-red-950"><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---- SZAFY RACK/LAN ---- */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200"><Server className="h-4 w-4 text-orange-500" /> Szafy rack / LAN</h3>
          <Button size="sm" onClick={openRackModal} className="bg-orange-600 text-white hover:bg-orange-500"><Plus className="mr-1 h-3.5 w-3.5" /> Dodaj szafę</Button>
        </div>
        {racks.length === 0 && <p className="text-sm text-zinc-500">Brak szaf rack.</p>}
        <div className="space-y-1.5">
          {racks.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-zinc-100">{r.name}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {[r.unitsCount ? `${r.unitsCount}U` : null, r.manufacturer, r.location].filter(Boolean).join(' · ')}
                </span>
                {r.description && <p className="mt-0.5 text-xs text-zinc-600">{r.description}</p>}
              </div>
              {isPrivileged && <button onClick={() => handleDeleteRack(r.id)} className="rounded p-1 text-zinc-500 hover:bg-red-950 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      </section>

      {/* ---- PPOŻ ---- */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200"><Flame className="h-4 w-4 text-orange-500" /> PPOŻ</h3>
          <Button size="sm" onClick={openFireModal} className="bg-orange-600 text-white hover:bg-orange-500"><Plus className="mr-1 h-3.5 w-3.5" /> Dodaj element</Button>
        </div>
        {fireSafety.length === 0 && <p className="text-sm text-zinc-500">Brak elementów PPOŻ.</p>}
        <div className="space-y-1.5">
          {fireSafety.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-zinc-100">{f.type}</span>
                {f.location && <span className="ml-2 text-xs text-zinc-500">{f.location}</span>}
                {f.description && <p className="mt-0.5 text-xs text-zinc-600">{f.description}</p>}
                {(f.lastInspectionDate || f.nextInspectionDate) && (
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {f.lastInspectionDate && `Ostatni przegląd: ${new Date(f.lastInspectionDate).toLocaleDateString('pl-PL')}`}
                    {f.lastInspectionDate && f.nextInspectionDate && ' · '}
                    {f.nextInspectionDate && `Następny: ${new Date(f.nextInspectionDate).toLocaleDateString('pl-PL')}`}
                  </p>
                )}
              </div>
              {isPrivileged && <button onClick={() => handleDeleteFire(f.id)} className="rounded p-1 text-zinc-500 hover:bg-red-950 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      </section>

      {/* ---- MODAL: Nowa rozdzielnia ---- */}
      <Modal open={boardModalOpen} onClose={() => setBoardModalOpen(false)} title="Nowa rozdzielnia">
        <form onSubmit={handleBoardSubmit}>
          <label className={labelClass}>Nazwa</label>
          <input required value={boardForm.name} onChange={(e) => setBoardForm({ ...boardForm, name: e.target.value })} placeholder="np. RG, RP1, Tablica piętro 1" className={fieldClass} />
          <label className={labelClass}>Liczba modułów DIN</label>
          <input list="module-count-presets" required type="number" min={1} value={boardForm.moduleCount} onChange={(e) => setBoardForm({ ...boardForm, moduleCount: Number(e.target.value) })} className={fieldClass} />
          <datalist id="module-count-presets">{MODULE_COUNT_PRESETS.map((n) => <option key={n} value={n} />)}</datalist>
          <label className={labelClass}>Producent (opcjonalnie)</label>
          <SuggestField value={boardForm.manufacturer} onChange={(v) => setBoardForm({ ...boardForm, manufacturer: v })} options={MANUFACTURER_PRESETS} listId="board-manufacturer" />
          <label className={labelClass}>Opis / lokalizacja (opcjonalnie)</label>
          <textarea rows={2} value={boardForm.description} onChange={(e) => setBoardForm({ ...boardForm, description: e.target.value })} className={fieldClass} />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBoardModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={boardSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {boardSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- MODAL: Aparat ---- */}
      <Modal open={deviceModalOpen} onClose={() => setDeviceModalOpen(false)} title={editingDeviceId ? 'Edytuj aparat' : 'Nowy aparat'}>
        <form onSubmit={handleDeviceSubmit}>
          <label className={labelClass}>Miejsce / numer modułu (opcjonalnie)</label>
          <input type="number" min={1} value={deviceForm.position} onChange={(e) => setDeviceForm({ ...deviceForm, position: e.target.value })} className={fieldClass} />

          <label className={labelClass}>Rodzaj</label>
          <select value={deviceForm.category} onChange={(e) => setDeviceForm({ ...deviceForm, category: e.target.value as DeviceCategory })} className={fieldClass}>
            <option value="MCB">Bezpiecznik</option>
            <option value="RCD">Różnicówka</option>
            <option value="OTHER">Inny</option>
          </select>

          {deviceForm.category === 'MCB' && (
            <>
              <label className={labelClass}>Charakterystyka</label>
              <select value={deviceForm.mcbCurve} onChange={(e) => setDeviceForm({ ...deviceForm, mcbCurve: e.target.value as McbCurve })} className={fieldClass}>
                {Object.entries(MCB_CURVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </>
          )}
          {deviceForm.category === 'RCD' && (
            <>
              <label className={labelClass}>Typ różnicówki</label>
              <select value={deviceForm.rcdType} onChange={(e) => setDeviceForm({ ...deviceForm, rcdType: e.target.value as RcdType })} className={fieldClass}>
                {Object.entries(RCD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </>
          )}

          <label className={labelClass}>Prąd znamionowy (opcjonalnie)</label>
          <SuggestField value={deviceForm.ratedCurrent} onChange={(v) => setDeviceForm({ ...deviceForm, ratedCurrent: v })} options={RATED_CURRENT_PRESETS} placeholder="np. 16A" listId="rated-current" />

          <label className={labelClass}>Liczba biegunów (opcjonalnie)</label>
          <SuggestField value={deviceForm.poles} onChange={(v) => setDeviceForm({ ...deviceForm, poles: v })} options={POLES_PRESETS} listId="poles" />

          <label className={labelClass}>Producent (opcjonalnie)</label>
          <SuggestField value={deviceForm.manufacturer} onChange={(v) => setDeviceForm({ ...deviceForm, manufacturer: v })} options={MANUFACTURER_PRESETS} listId="device-manufacturer" />

          <label className={labelClass}>Przeznaczenie / opis (opcjonalnie)</label>
          <input value={deviceForm.description} onChange={(e) => setDeviceForm({ ...deviceForm, description: e.target.value })} placeholder="np. oświetlenie łazienki" className={fieldClass} />

          <label className={labelClass}>Ilość</label>
          <input type="number" min={1} value={deviceForm.quantity} onChange={(e) => setDeviceForm({ ...deviceForm, quantity: Number(e.target.value) })} className={fieldClass} />

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeviceModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={deviceSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {deviceSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- MODAL: Szafa rack ---- */}
      <Modal open={rackModalOpen} onClose={() => setRackModalOpen(false)} title="Nowa szafa rack">
        <form onSubmit={handleRackSubmit}>
          <label className={labelClass}>Nazwa</label>
          <input required value={rackForm.name} onChange={(e) => setRackForm({ ...rackForm, name: e.target.value })} placeholder="np. Szafa serwerowa parter" className={fieldClass} />
          <label className={labelClass}>Liczba U (opcjonalnie)</label>
          <input type="number" min={1} value={rackForm.unitsCount} onChange={(e) => setRackForm({ ...rackForm, unitsCount: e.target.value })} className={fieldClass} />
          <label className={labelClass}>Producent (opcjonalnie)</label>
          <SuggestField value={rackForm.manufacturer} onChange={(v) => setRackForm({ ...rackForm, manufacturer: v })} options={MANUFACTURER_PRESETS} listId="rack-manufacturer" />
          <label className={labelClass}>Lokalizacja (opcjonalnie)</label>
          <input value={rackForm.location} onChange={(e) => setRackForm({ ...rackForm, location: e.target.value })} className={fieldClass} />
          <label className={labelClass}>Opis (opcjonalnie)</label>
          <textarea rows={2} value={rackForm.description} onChange={(e) => setRackForm({ ...rackForm, description: e.target.value })} className={fieldClass} />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRackModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={rackSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {rackSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- MODAL: PPOŻ ---- */}
      <Modal open={fireModalOpen} onClose={() => setFireModalOpen(false)} title="Nowy element PPOŻ">
        <form onSubmit={handleFireSubmit}>
          <label className={labelClass}>Rodzaj</label>
          <SuggestField value={fireForm.type} onChange={(v) => setFireForm({ ...fireForm, type: v })} options={FIRE_SAFETY_TYPE_PRESETS} listId="fire-type" />
          <label className={labelClass}>Lokalizacja (opcjonalnie)</label>
          <input value={fireForm.location} onChange={(e) => setFireForm({ ...fireForm, location: e.target.value })} className={fieldClass} />
          <label className={labelClass}>Opis (opcjonalnie)</label>
          <textarea rows={2} value={fireForm.description} onChange={(e) => setFireForm({ ...fireForm, description: e.target.value })} className={fieldClass} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Ostatni przegląd</label>
              <input type="date" value={fireForm.lastInspectionDate} onChange={(e) => setFireForm({ ...fireForm, lastInspectionDate: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Następny przegląd</label>
              <input type="date" value={fireForm.nextInspectionDate} onChange={(e) => setFireForm({ ...fireForm, nextInspectionDate: e.target.value })} className={fieldClass} />
            </div>
          </div>
          <label className={labelClass}>Numer certyfikatu (opcjonalnie)</label>
          <input value={fireForm.certificateNumber} onChange={(e) => setFireForm({ ...fireForm, certificateNumber: e.target.value })} className={fieldClass} />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFireModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={fireSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {fireSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
