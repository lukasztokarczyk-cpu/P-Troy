'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Search, Wrench, Settings2, Tag, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface AssetCategory { id: string; name: string; }
interface AssetStatus { id: string; name: string; color: string; }
interface AssetListItem {
  id: string; name: string;
  category: AssetCategory; status: AssetStatus;
  locationType: 'WAREHOUSE' | 'INSTALLER' | 'ADMIN' | 'OTHER';
  warehouse: { name: string } | null;
  holderUser: { firstName: string; lastName: string } | null;
  otherHolderText: string | null;
  photos: { url?: string }[];
}

function locationText(a: AssetListItem): string {
  if (a.locationType === 'WAREHOUSE') return `Magazyn: ${a.warehouse?.name ?? '—'}`;
  if (a.locationType === 'OTHER') return a.otherHolderText || 'Inne';
  if (a.holderUser) return `${a.locationType === 'ADMIN' ? 'Administrator' : 'Instalator'}: ${a.holderUser.firstName} ${a.holderUser.lastName}`;
  return '—';
}

const emptyForm = {
  name: '', categoryId: '', manufacturer: '', model: '', serialNumber: '',
  purchaseDate: '', warrantyEndDate: '', description: '',
};

export default function AssetsPage() {
  const { isPrivileged, user } = useAuth();
  const [assets, setAssets] = useState<AssetListItem[] | null>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photoFiles, setPhotoFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [statusesModalOpen, setStatusesModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#f97316');

  const loadCategories = useCallback(() => {
    apiClient<AssetCategory[]>('/api/assets/categories').then(setCategories).catch(() => setCategories([]));
  }, []);
  const loadStatuses = useCallback(() => {
    apiClient<AssetStatus[]>('/api/assets/statuses').then(setStatuses).catch(() => setStatuses([]));
  }, []);

  const loadAssets = useCallback((query: string, cat: string, stat: string) => {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (cat) params.set('categoryId', cat);
    if (stat) params.set('statusId', stat);
    const qs = params.toString();
    apiClient<AssetListItem[]>(`/api/assets${qs ? `?${qs}` : ''}`).then(setAssets).catch(() => setAssets([]));
  }, []);

  useEffect(() => { loadCategories(); loadStatuses(); }, [loadCategories, loadStatuses]);
  useEffect(() => {
    const t = setTimeout(() => loadAssets(search, categoryFilter, statusFilter), 300);
    return () => clearTimeout(t);
  }, [search, categoryFilter, statusFilter, loadAssets]);

  const openModal = () => {
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
    setPhotoFiles(null);
    setFormError(null);
    setModalOpen(true);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const photosBase64 = photoFiles ? await Promise.all(Array.from(photoFiles).map(fileToBase64)) : undefined;
      await apiClient('/api/assets', {
        method: 'POST',
        body: {
          ...form,
          purchaseDate: form.purchaseDate || undefined,
          warrantyEndDate: form.warrantyEndDate || undefined,
          photosBase64,
        },
      });
      setModalOpen(false);
      loadAssets(search, categoryFilter, statusFilter);
    } catch (err: any) {
      setFormError(err.message || 'Nie udało się dodać sprzętu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await apiClient('/api/assets/categories', { method: 'POST', body: { name: newCategoryName.trim() } }).catch((err) => alert(err.message));
    setNewCategoryName('');
    loadCategories();
  };
  const handleRemoveCategory = async (id: string) => {
    if (!window.confirm('Usunąć tę kategorię?')) return;
    await apiClient(`/api/assets/categories/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadCategories();
  };

  const handleAddStatus = async () => {
    if (!newStatusName.trim()) return;
    await apiClient('/api/assets/statuses', { method: 'POST', body: { name: newStatusName.trim(), color: newStatusColor } }).catch((err) => alert(err.message));
    setNewStatusName('');
    loadStatuses();
  };
  const handleRemoveStatus = async (id: string) => {
    if (!window.confirm('Usunąć ten status?')) return;
    await apiClient(`/api/assets/statuses/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    loadStatuses();
  };

  if (assets === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Sprzęt</h1>
          <p className="text-sm text-zinc-500">
            {isPrivileged ? 'Ewidencja sprzętu firmowego.' : 'Sprzęt aktualnie przypisany do Ciebie.'}
          </p>
        </div>

        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj sprzętu, nr seryjnego..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 focus:border-orange-500 focus:outline-none"
          />
        </div>

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 focus:outline-none">
          <option value="">Wszystkie kategorie</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 focus:outline-none">
          <option value="">Wszystkie statusy</option>
          {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {isPrivileged && (
          <>
            <Button onClick={() => setCategoriesModalOpen(true)} variant="outline" size="sm" className="border-zinc-700 text-zinc-300" title="Zarządzaj kategoriami">
              <Tag className="h-4 w-4" />
            </Button>
            <Button onClick={() => setStatusesModalOpen(true)} variant="outline" size="sm" className="border-zinc-700 text-zinc-300" title="Zarządzaj statusami">
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
              <Plus className="mr-1 h-4 w-4" /> Nowy sprzęt
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => (
          <Link key={a.id} href={`/assets/${a.id}`} className="block rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-orange-600/40">
            <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-lg bg-zinc-800">
              {a.photos[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photos[0].url} alt={a.name} className="h-full w-full object-cover" />
              ) : (
                <Wrench className="h-8 w-8 text-zinc-600" />
              )}
            </div>
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">{a.name}</h3>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${a.status.color}26`, color: a.status.color }}>
                {a.status.name}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{a.category.name}</p>
            <p className="mt-1 text-xs text-zinc-400">{locationText(a)}</p>
          </Link>
        ))}
        {assets.length === 0 && <p className="col-span-full py-12 text-center text-sm text-zinc-500">Brak sprzętu.</p>}
      </div>

      {/* ---- MODAL: NOWY SPRZĘT ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowy sprzęt">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Nazwa</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. Wiertarka udarowa Bosch" className={fieldClass} />

          <label className={labelClass}>Kategoria</label>
          <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={fieldClass}>
            {categories.length === 0 && <option value="">Brak kategorii — dodaj najpierw</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Producent</label>
              <input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <label className={labelClass}>Numer seryjny (opcjonalnie)</label>
          <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className={fieldClass} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Data zakupu (opcjonalnie)</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Koniec gwarancji (opcjonalnie)</label>
              <input type="date" value={form.warrantyEndDate} onChange={(e) => setForm({ ...form, warrantyEndDate: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <label className={labelClass}>Opis</label>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} />

          <label className={labelClass}>Zdjęcia (opcjonalnie, jedno lub wiele)</label>
          <input type="file" accept="image/*" multiple onChange={(e) => setPhotoFiles(e.target.files)} className={fieldClass} />

          {formError && <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-400">{formError}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting || categories.length === 0} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- MODAL: KATEGORIE ---- */}
      <Modal open={categoriesModalOpen} onClose={() => setCategoriesModalOpen(false)} title="Kategorie sprzętu">
        <div className="mb-3 flex gap-2">
          <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Nowa kategoria" className={fieldClass + ' mb-0'} />
          <Button type="button" onClick={handleAddCategory} className="bg-orange-600 text-white hover:bg-orange-500">Dodaj</Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200">
              {c.name}
              <button onClick={() => handleRemoveCategory(c.id)} className="text-zinc-500 hover:text-red-400"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Modal>

      {/* ---- MODAL: STATUSY ---- */}
      <Modal open={statusesModalOpen} onClose={() => setStatusesModalOpen(false)} title="Statusy sprzętu">
        <div className="mb-3 flex gap-2">
          <input type="color" value={newStatusColor} onChange={(e) => setNewStatusColor(e.target.value)} className="h-10 w-12 rounded-lg border border-zinc-700 bg-zinc-900" />
          <input value={newStatusName} onChange={(e) => setNewStatusName(e.target.value)} placeholder="Nowy status" className={fieldClass + ' mb-0'} />
          <Button type="button" onClick={handleAddStatus} className="bg-orange-600 text-white hover:bg-orange-500">Dodaj</Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {statuses.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </span>
              <button onClick={() => handleRemoveStatus(s.id)} className="text-zinc-500 hover:text-red-400"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
