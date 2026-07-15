'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, Plus, Fuel, Wrench, Package } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface VehicleDetail {
  id: string; brand: string; model: string; registrationNumber: string;
  equipment: {
    id: string; name: string; category: string; serialNumber: string | null; quantity: number;
    assignedInstaller: { id: string; firstName: string; lastName: string } | null;
  }[];
  materialWarehouse: { id: string; stockLevels: { quantity: number; product: { id: string; name: string; unit: string } }[] } | null;
  expenseNotes: { id: string; amount: number; createdAt: string; user: { firstName: string; lastName: string } }[];
}
interface Installer { id: string; firstName: string; lastName: string; }
interface Product { id: string; name: string; unit: string; }

const EQUIPMENT_CATEGORY_OPTIONS = [
  { value: 'TOOL', label: 'Narzędzie' },
  { value: 'POWER_TOOL', label: 'Elektronarzędzie' },
  { value: 'MATERIAL', label: 'Materiał' },
  { value: 'MEASURING_DEVICE', label: 'Urządzenie pomiarowe' },
  { value: 'SAFETY_EQUIPMENT', label: 'Wyposażenie BHP' },
];

const TABS = [
  { key: 'equipment', label: 'Wyposażenie' },
  { key: 'materials', label: 'Materiały' },
  { key: 'refueling', label: 'Tankowania' },
] as const;

export default function VehicleDetailPage() {
  const params = useParams();
  const vehicleId = params.id as string;
  const { isPrivileged, user } = useAuth();

  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('equipment');
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [equipModalOpen, setEquipModalOpen] = useState(false);
  const [equipForm, setEquipForm] = useState({ name: '', category: 'TOOL', serialNumber: '', quantity: '1' });
  const [savingEquip, setSavingEquip] = useState(false);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialForm, setMaterialForm] = useState({ productId: '', quantity: '0' });
  const [savingMaterial, setSavingMaterial] = useState(false);

  const loadVehicle = useCallback(() => {
    apiClient<VehicleDetail>(`/api/vehicles/${vehicleId}`).then(setVehicle).catch(() => setVehicle(null));
  }, [vehicleId]);

  useEffect(() => { loadVehicle(); }, [loadVehicle]);
  useEffect(() => {
    if (isPrivileged) apiClient<Installer[]>('/api/users/installers').then(setInstallers).catch(() => setInstallers([]));
    apiClient<Product[]>('/api/warehouse/products').then(setProducts).catch(() => setProducts([]));
  }, [isPrivileged]);

  const canEditMaterials = isPrivileged || user?.role === 'INSTALATOR';

  const openEquipModal = () => {
    setEquipForm({ name: '', category: 'TOOL', serialNumber: '', quantity: '1' });
    setEquipModalOpen(true);
  };
  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEquip(true);
    try {
      await apiClient(`/api/vehicles/${vehicleId}/equipment`, {
        method: 'POST',
        body: { ...equipForm, quantity: Number(equipForm.quantity) },
      });
      setEquipModalOpen(false);
      loadVehicle();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEquip(false);
    }
  };

  const handleAssignEquipment = async (equipmentId: string, installerId: string) => {
    await apiClient(`/api/vehicles/equipment/${equipmentId}/assign`, {
      method: 'PATCH',
      body: { installerId: installerId || undefined },
    }).catch((err) => alert(err.message));
    loadVehicle();
  };

  const openMaterialModal = () => {
    setMaterialForm({ productId: products[0]?.id || '', quantity: '0' });
    setMaterialModalOpen(true);
  };
  const handleSetMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMaterial(true);
    try {
      await apiClient(`/api/vehicles/${vehicleId}/materials`, {
        method: 'PATCH',
        body: { productId: materialForm.productId, quantity: Number(materialForm.quantity) },
      });
      setMaterialModalOpen(false);
      loadVehicle();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingMaterial(false);
    }
  };

  if (!vehicle) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <Link href="/vehicles" className="mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-500">
        <ArrowLeft className="h-3.5 w-3.5" /> Pojazdy
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-white">{vehicle.brand} {vehicle.model}</h1>
      <p className="mb-5 text-sm text-zinc-500">{vehicle.registrationNumber}</p>

      <div className="mb-4 flex gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-b-2 border-orange-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'equipment' && (
        <div>
          {isPrivileged && (
            <div className="mb-3 flex justify-end">
              <Button size="sm" onClick={openEquipModal} className="bg-orange-600 text-white hover:bg-orange-500">
                <Plus className="mr-1 h-3.5 w-3.5" /> Dodaj sprzęt
              </Button>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
                  <th className="px-4 py-2.5">Sprzęt</th>
                  <th className="px-4 py-2.5">Kategoria</th>
                  <th className="px-4 py-2.5">Ilość</th>
                  <th className="px-4 py-2.5">Przypisany instalator</th>
                </tr>
              </thead>
              <tbody>
                {vehicle.equipment.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Brak wyposażenia</td></tr>
                ) : (
                  vehicle.equipment.map((eq) => (
                    <tr key={eq.id} className="border-b border-zinc-800 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-100">
                        <Wrench className="mr-1.5 inline h-3.5 w-3.5 text-orange-500" />{eq.name}
                        {eq.serialNumber && <span className="ml-1 text-xs text-zinc-600">#{eq.serialNumber}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{EQUIPMENT_CATEGORY_OPTIONS.find((c) => c.value === eq.category)?.label ?? eq.category}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{eq.quantity}</td>
                      <td className="px-4 py-2.5">
                        {isPrivileged ? (
                          <select
                            value={eq.assignedInstaller?.id || ''}
                            onChange={(e) => handleAssignEquipment(eq.id, e.target.value)}
                            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                          >
                            <option value="">— nieprzypisany —</option>
                            {installers.map((i) => <option key={i.id} value={i.id}>{i.firstName} {i.lastName}</option>)}
                          </select>
                        ) : (
                          <span className="text-zinc-400">{eq.assignedInstaller ? `${eq.assignedInstaller.firstName} ${eq.assignedInstaller.lastName}` : '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div>
          {canEditMaterials && (
            <div className="mb-3 flex justify-end">
              <Button size="sm" onClick={openMaterialModal} disabled={!products.length} className="bg-orange-600 text-white hover:bg-orange-500">
                <Package className="mr-1 h-3.5 w-3.5" /> Ustaw ilość materiału
              </Button>
            </div>
          )}
          {!products.length && (
            <p className="mb-3 rounded-lg border border-orange-800/40 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
              Brak produktów w systemie — dodaj je najpierw w zakładce Magazyn (możesz tam dodać dowolny materiał, np. złączki).
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
                  <th className="px-4 py-2.5">Materiał</th>
                  <th className="px-4 py-2.5">Ilość w pojeździe</th>
                </tr>
              </thead>
              <tbody>
                {(vehicle.materialWarehouse?.stockLevels ?? []).filter((s) => s.quantity > 0).length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-zinc-500">Brak materiałów w pojeździe</td></tr>
                ) : (
                  vehicle.materialWarehouse!.stockLevels.filter((s) => s.quantity > 0).map((s) => (
                    <tr key={s.product.id} className="border-b border-zinc-800 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-100">{s.product.name}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{s.quantity} {s.product.unit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'refueling' && (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Instalator</th>
                <th className="px-4 py-2.5">Kwota</th>
              </tr>
            </thead>
            <tbody>
              {vehicle.expenseNotes.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-500"><Fuel className="mx-auto mb-1 h-4 w-4 text-zinc-700" />Brak zarejestrowanych tankowań</td></tr>
              ) : (
                vehicle.expenseNotes.map((n) => (
                  <tr key={n.id} className="border-b border-zinc-800 last:border-0">
                    <td className="px-4 py-2.5 text-zinc-500">{new Date(n.createdAt).toLocaleDateString('pl-PL')}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{n.user.firstName} {n.user.lastName}</td>
                    <td className="px-4 py-2.5 font-medium text-zinc-100">{n.amount.toFixed(2)} zł</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={equipModalOpen} onClose={() => setEquipModalOpen(false)} title="Nowy sprzęt">
        <form onSubmit={handleAddEquipment}>
          <label className={labelClass}>Nazwa</label>
          <input required value={equipForm.name} onChange={(e) => setEquipForm({ ...equipForm, name: e.target.value })} placeholder="np. Wiertarka udarowa" className={fieldClass} />

          <label className={labelClass}>Kategoria</label>
          <select value={equipForm.category} onChange={(e) => setEquipForm({ ...equipForm, category: e.target.value })} className={fieldClass}>
            {EQUIPMENT_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nr seryjny (opcjonalnie)</label>
              <input value={equipForm.serialNumber} onChange={(e) => setEquipForm({ ...equipForm, serialNumber: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Ilość</label>
              <input type="number" min="1" value={equipForm.quantity} onChange={(e) => setEquipForm({ ...equipForm, quantity: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEquipModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={savingEquip} className="bg-orange-600 text-white hover:bg-orange-500">
              {savingEquip ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={materialModalOpen} onClose={() => setMaterialModalOpen(false)} title="Materiał w pojeździe">
        <form onSubmit={handleSetMaterial}>
          <label className={labelClass}>Produkt</label>
          <select required value={materialForm.productId} onChange={(e) => setMaterialForm({ ...materialForm, productId: e.target.value })} className={fieldClass}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className={labelClass}>Ilość aktualnie w pojeździe</label>
          <input required type="number" min="0" step="0.01" value={materialForm.quantity} onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })} className={fieldClass} />
          <p className="mt-2 text-xs text-zinc-600">Wpisz dokładny stan (nie zmianę) — np. "12" jeśli w aucie zostało 12 metrów kabla.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMaterialModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={savingMaterial} className="bg-orange-600 text-white hover:bg-orange-500">
              {savingMaterial ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
