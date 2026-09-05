'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Copy, Pencil, Tag } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

type LabelTargetType = 'RACK' | 'RACK_DEVICE' | 'RACK_DEVICE_PORT' | 'DISTRIBUTION_BOARD' | 'DISTRIBUTION_BOARD_DEVICE';

const TARGET_TYPE_LABELS: Record<LabelTargetType, string> = {
  RACK: 'Szafa rack',
  RACK_DEVICE: 'Urządzenie w szafie rack',
  RACK_DEVICE_PORT: 'Port urządzenia',
  DISTRIBUTION_BOARD: 'Rozdzielnia',
  DISTRIBUTION_BOARD_DEVICE: 'Aparat w rozdzielni',
};
const TARGET_TYPES = Object.keys(TARGET_TYPE_LABELS) as LabelTargetType[];

interface LabelFieldDef { key: string; label: string; }
interface FieldLayoutItem { field?: string; bold?: boolean; }
interface LabelTemplate {
  id: string; name: string; targetType: LabelTargetType; isSystem: boolean; isWarning: boolean;
  widthMm: number; heightMm: number; includeQr: boolean; fieldsLayout: FieldLayoutItem[];
}

const emptyForm = { name: '', targetType: 'DISTRIBUTION_BOARD_DEVICE' as LabelTargetType, widthMm: 50, heightMm: 30, includeQr: false, isWarning: false, selectedFields: [] as string[], boldFields: [] as string[] };

export default function LabelTemplatesPage() {
  const { user, isLoading, isPrivileged } = useAuth();
  const [activeType, setActiveType] = useState<LabelTargetType>('DISTRIBUTION_BOARD_DEVICE');
  const [templates, setTemplates] = useState<LabelTemplate[] | null>(null);
  const [availableFields, setAvailableFields] = useState<LabelFieldDef[]>([]);

  const load = () => {
    apiClient<LabelTemplate[]>(`/api/label-templates?targetType=${activeType}`).then(setTemplates).catch(() => setTemplates([]));
    apiClient<LabelFieldDef[]>(`/api/label-templates/fields?targetType=${activeType}`).then(setAvailableFields).catch(() => setAvailableFields([]));
  };
  useEffect(() => { if (isPrivileged) load(); }, [activeType, isPrivileged]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => { setEditingId(null); setForm({ ...emptyForm, targetType: activeType }); setModalOpen(true); };
  const openEdit = (t: LabelTemplate) => {
    setEditingId(t.id);
    setForm({
      name: t.name, targetType: t.targetType, widthMm: t.widthMm, heightMm: t.heightMm,
      includeQr: t.includeQr, isWarning: t.isWarning,
      selectedFields: t.fieldsLayout.map((f) => f.field).filter(Boolean) as string[],
      boldFields: t.fieldsLayout.filter((f) => f.bold).map((f) => f.field).filter(Boolean) as string[],
    });
    setModalOpen(true);
  };

  const toggleField = (key: string) => {
    setForm((f) => f.selectedFields.includes(key)
      ? { ...f, selectedFields: f.selectedFields.filter((k) => k !== key), boldFields: f.boldFields.filter((k) => k !== key) }
      : { ...f, selectedFields: [...f.selectedFields, key] });
  };
  const toggleBold = (key: string) => {
    setForm((f) => f.boldFields.includes(key) ? { ...f, boldFields: f.boldFields.filter((k) => k !== key) } : { ...f, boldFields: [...f.boldFields, key] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const fieldsLayout = form.isWarning ? [] : form.selectedFields.map((field) => ({ field, bold: form.boldFields.includes(field) }));
    const body = { name: form.name, targetType: form.targetType, widthMm: form.widthMm, heightMm: form.heightMm, includeQr: form.includeQr, isWarning: form.isWarning, fieldsLayout };
    try {
      if (editingId) {
        await apiClient(`/api/label-templates/${editingId}`, { method: 'PATCH', body });
      } else {
        await apiClient('/api/label-templates', { method: 'POST', body });
      }
      setModalOpen(false);
      load();
    } catch (err: any) { alert(err.message); } finally { setSubmitting(false); }
  };

  const handleDuplicate = async (id: string) => {
    await apiClient(`/api/label-templates/${id}/duplicate`, { method: 'POST' }).catch((err) => alert(err.message));
    load();
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm('Usunąć ten szablon etykiety?')) return;
    await apiClient(`/api/label-templates/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    load();
  };

  if (isLoading) return null;
  if (!isPrivileged) {
    return <div className="flex h-64 items-center justify-center text-sm text-zinc-500">Ta sekcja jest dostępna wyłącznie dla administratora lub brygadzisty.</div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white"><Tag className="h-5 w-5 text-orange-500" /> Szablony etykiet</h1>
          <p className="text-sm text-zinc-500">Wspólny system etykiet dla Rack/LAN i Rozdzielni elektrycznych.</p>
        </div>
        <Button onClick={openCreate} className="bg-orange-600 text-white hover:bg-orange-500"><Plus className="mr-1 h-4 w-4" /> Nowy szablon</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TARGET_TYPES.map((t) => (
          <button key={t} onClick={() => setActiveType(t)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeType === t ? 'bg-orange-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`}>
            {TARGET_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {templates === null ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>
      ) : (
        <div className="space-y-2">
          {templates.length === 0 && <p className="text-sm text-zinc-500">Brak szablonów dla tego typu.</p>}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div>
                <span className="font-medium text-zinc-100">{t.name}</span>
                {t.isSystem && <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">systemowy</span>}
                {t.isWarning && <span className="ml-2 rounded-full bg-amber-950 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-500">ostrzegawczy</span>}
                <p className="mt-0.5 text-xs text-zinc-500">{t.widthMm}×{t.heightMm}mm{t.includeQr ? ' · QR' : ''}{!t.isWarning ? ` · ${t.fieldsLayout.length} pól` : ''}</p>
              </div>
              <div className="flex gap-1">
                {!t.isSystem && <button onClick={() => openEdit(t)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Pencil className="h-4 w-4" /></button>}
                <button onClick={() => handleDuplicate(t.id)} title="Duplikuj" className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Copy className="h-4 w-4" /></button>
                {!t.isSystem && <button onClick={() => handleDelete(t.id)} className="rounded p-1.5 text-zinc-500 hover:bg-red-950 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edytuj szablon' : 'Nowy szablon etykiety'} maxWidth="max-w-lg">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Nazwa</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} />

          {!editingId && (
            <>
              <label className={labelClass}>Typ elementu</label>
              <select value={form.targetType} onChange={(e) => { const targetType = e.target.value as LabelTargetType; setForm({ ...form, targetType, selectedFields: [], boldFields: [] }); apiClient<LabelFieldDef[]>(`/api/label-templates/fields?targetType=${targetType}`).then(setAvailableFields); }} className={fieldClass}>
                {TARGET_TYPES.map((t) => <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>)}
              </select>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Szerokość (mm)</label>
              <input type="number" min={10} value={form.widthMm} onChange={(e) => setForm({ ...form, widthMm: Number(e.target.value) })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Wysokość (mm)</label>
              <input type="number" min={10} value={form.heightMm} onChange={(e) => setForm({ ...form, heightMm: Number(e.target.value) })} className={fieldClass} />
            </div>
          </div>

          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.includeQr} onChange={(e) => setForm({ ...form, includeQr: e.target.checked })} className="rounded border-zinc-700 bg-zinc-900" /> Dołącz kod QR
            </label>
            {!editingId && (
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={form.isWarning} onChange={(e) => setForm({ ...form, isWarning: e.target.checked })} className="rounded border-zinc-700 bg-zinc-900" /> Szablon ostrzegawczy (treść ręczna)
              </label>
            )}
          </div>

          {!form.isWarning && (
            <>
              <label className={`${labelClass} mt-3`}>Pola na etykiecie (kolejność wydruku)</label>
              <div className="space-y-1 rounded-lg border border-zinc-800 p-2">
                {availableFields.length === 0 && <p className="px-1 py-1 text-xs text-zinc-600">Brak dostępnych pól dla tego typu.</p>}
                {availableFields.map((f) => (
                  <div key={f.key} className="flex items-center justify-between rounded px-1 py-1 text-sm hover:bg-zinc-900">
                    <label className="flex items-center gap-2 text-zinc-300">
                      <input type="checkbox" checked={form.selectedFields.includes(f.key)} onChange={() => toggleField(f.key)} className="rounded border-zinc-700 bg-zinc-900" /> {f.label}
                    </label>
                    {form.selectedFields.includes(f.key) && (
                      <label className="flex items-center gap-1 text-xs text-zinc-500">
                        <input type="checkbox" checked={form.boldFields.includes(f.key)} onChange={() => toggleBold(f.key)} className="rounded border-zinc-700 bg-zinc-900" /> pogrubione
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting || (!form.isWarning && form.selectedFields.length === 0)} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
