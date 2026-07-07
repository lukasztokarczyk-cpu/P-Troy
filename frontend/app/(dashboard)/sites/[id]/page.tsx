'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, Upload, Camera, FileText, Printer, Plus, CheckCircle2, Package } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface SiteDetail { id: string; name: string; investor: string; address: string; status: string; }
interface Photo {
  id: string; fullResUrl: string | null; thumbnailUrl: string | null; description: string | null;
  takenAt: string; author: { firstName: string; lastName: string };
}
interface Plan { id: string; fileName: string; fileType: string; fileUrl: string | null; createdAt: string; }
interface Summary {
  site: { name: string; investor: string; address: string; startDate: string | null; completedAt: string | null };
  completedWork: { title: string; description: string | null; completedAt: string | null; assignees: string[] }[];
  extraWork: { title: string; description: string | null; completedAt: string | null; assignees: string[] }[];
  materialsUsed?: { product: string; quantity: number; unit: string; date: string }[];
}
interface TaskItem { id: string; title: string; status: string; isExtra: boolean; priority: string; }
interface MaterialUsage { id: string; quantity: number; comment: string | null; createdAt: string; product: { name: string; unit: string } }
interface Product { id: string; name: string; unit: string; }
interface Warehouse { id: string; name: string; }

const TABS = [
  { key: 'tasks', label: 'Zadania' },
  { key: 'materials', label: 'Materiały' },
  { key: 'documentation', label: 'Dokumentacja' },
  { key: 'summary', label: 'Podsumowanie' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planowana', IN_PROGRESS: 'W trakcie', ON_HOLD: 'Wstrzymana', COMPLETED: 'Zakończona', ARCHIVED: 'Zarchiwizowana',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SiteDetailPage() {
  const params = useParams();
  const siteId = params.id as string;
  const { isPrivileged } = useAuth();

  const [site, setSite] = useState<SiteDetail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('tasks');

  // ---- Zadania ----
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', isExtra: false });
  const [savingTask, setSavingTask] = useState(false);

  // ---- Materiały ----
  const [materialUsages, setMaterialUsages] = useState<MaterialUsage[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialForm, setMaterialForm] = useState({ productId: '', warehouseId: '', quantity: '1', comment: '' });
  const [savingMaterial, setSavingMaterial] = useState(false);

  // ---- Dokumentacja ----
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const [photoDescription, setPhotoDescription] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const planInputRef = useRef<HTMLInputElement>(null);

  // ---- Podsumowanie ----
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clientView, setClientView] = useState(false);
  const [completing, setCompleting] = useState(false);

  const loadSite = useCallback(() => {
    apiClient<SiteDetail>(`/api/sites/${siteId}`).then(setSite).catch(() => setSite(null));
  }, [siteId]);
  const loadTasks = useCallback(() => {
    apiClient<TaskItem[]>(`/api/tasks?siteId=${siteId}`).then(setTasks).catch(() => setTasks([]));
  }, [siteId]);
  const loadMaterialUsages = useCallback(() => {
    apiClient<{ materialUsages: MaterialUsage[] }>(`/api/sites/${siteId}`)
      .then((full: any) => setMaterialUsages(full.materialUsages || []))
      .catch(() => setMaterialUsages([]));
  }, [siteId]);
  const loadPhotos = useCallback(() => {
    apiClient<Photo[]>(`/api/sites/${siteId}/photos`).then(setPhotos).catch(() => setPhotos([]));
  }, [siteId]);
  const loadPlans = useCallback(() => {
    apiClient<Plan[]>(`/api/sites/${siteId}/plans`).then(setPlans).catch(() => setPlans([]));
  }, [siteId]);
  const loadSummary = useCallback((asClient: boolean) => {
    apiClient<Summary>(`/api/sites/${siteId}/summary?client=${asClient}`).then(setSummary).catch(() => setSummary(null));
  }, [siteId]);

  useEffect(() => { loadSite(); loadTasks(); loadMaterialUsages(); loadPhotos(); loadPlans(); }, [loadSite, loadTasks, loadMaterialUsages, loadPhotos, loadPlans]);
  useEffect(() => { if (tab === 'summary') loadSummary(clientView); }, [tab, clientView, loadSummary]);
  useEffect(() => {
    if (tab !== 'materials') return;
    apiClient<Product[]>('/api/warehouse/products').then(setProducts).catch(() => setProducts([]));
    apiClient<Warehouse[]>('/api/warehouse/warehouses').then(setWarehouses).catch(() => setWarehouses([]));
  }, [tab]);

  // ---- Akcje: zadania ----

  const handleMarkDone = async (taskId: string) => {
    await apiClient(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: { status: 'DONE' } }).catch((err) => alert(err.message));
    loadTasks();
  };

  const openTaskModal = () => { setTaskForm({ title: '', isExtra: false }); setTaskModalOpen(true); };
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTask(true);
    try {
      await apiClient('/api/tasks', { method: 'POST', body: { title: taskForm.title, siteId, isExtra: taskForm.isExtra, assigneeIds: [] } });
      setTaskModalOpen(false);
      loadTasks();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingTask(false);
    }
  };

  // ---- Akcje: materiały ----

  const openMaterialModal = () => {
    setMaterialForm({ productId: products[0]?.id || '', warehouseId: warehouses[0]?.id || '', quantity: '1', comment: '' });
    setMaterialModalOpen(true);
  };
  const handleRecordMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMaterial(true);
    try {
      await apiClient('/api/warehouse/material-usage', {
        method: 'POST',
        body: {
          siteId,
          productId: materialForm.productId,
          warehouseId: materialForm.warehouseId,
          quantity: Number(materialForm.quantity),
          comment: materialForm.comment || undefined,
        },
      });
      setMaterialModalOpen(false);
      loadMaterialUsages();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingMaterial(false);
    }
  };

  // ---- Akcje: dokumentacja ----

  const handlePhotoFile = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const imageBase64 = await fileToBase64(file);
      await apiClient(`/api/sites/${siteId}/photos`, { method: 'POST', body: { imageBase64, description: photoDescription || undefined } });
      setPhotoDescription('');
      loadPhotos();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handlePlanFile = async (file: File) => {
    setUploadingPlan(true);
    try {
      const fileBase64 = await fileToBase64(file);
      await apiClient(`/api/sites/${siteId}/plans`, { method: 'POST', body: { fileName: file.name, fileType: file.type, fileBase64 } });
      loadPlans();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingPlan(false);
      if (planInputRef.current) planInputRef.current.value = '';
    }
  };

  const handleComplete = async () => {
    if (!window.confirm('Oznaczyć budowę jako zakończoną? Zostanie wygenerowane podsumowanie.')) return;
    setCompleting(true);
    try {
      await apiClient(`/api/sites/${siteId}/complete`, { method: 'PATCH' });
      loadSite();
      setTab('summary');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCompleting(false);
    }
  };

  if (!site) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <Link href="/sites" className="mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-500">
        <ArrowLeft className="h-3.5 w-3.5" /> Budowy
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-white">{site.name}</h1>
          <p className="text-sm text-zinc-500">{site.investor} · {site.address}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-orange-600/20 px-2.5 py-1 text-xs font-medium text-orange-400">
            {STATUS_LABELS[site.status] ?? site.status}
          </span>
          {isPrivileged && site.status !== 'COMPLETED' && (
            <Button size="sm" onClick={handleComplete} disabled={completing} className="bg-orange-600 text-white hover:bg-orange-500">
              {completing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />} Zakończ budowę
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-b-2 border-orange-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- ZADANIA ---- */}
      {tab === 'tasks' && (
        <div>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={openTaskModal} className="bg-orange-600 text-white hover:bg-orange-500">
              <Plus className="mr-1 h-3.5 w-3.5" /> Nowe zadanie
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
                  <th className="px-4 py-2.5">Zadanie</th>
                  <th className="px-4 py-2.5">Typ</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {tasks === null ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-zinc-600" /></td></tr>
                ) : tasks.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Brak zadań na tej budowie</td></tr>
                ) : (
                  tasks.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-100">{t.title}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{t.isExtra ? 'Dodatkowa' : 'Podstawowa'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.status === 'DONE' ? 'bg-emerald-900/30 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                          {t.status === 'DONE' ? 'Wykonane' : t.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {t.status !== 'DONE' && (
                          <button onClick={() => handleMarkDone(t.id)} className="text-xs text-orange-400 hover:text-orange-300">
                            Oznacz jako wykonane
                          </button>
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

      {/* ---- MATERIAŁY ---- */}
      {tab === 'materials' && (
        <div>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={openMaterialModal} disabled={!products.length} className="bg-orange-600 text-white hover:bg-orange-500">
              <Package className="mr-1 h-3.5 w-3.5" /> Pobierz materiał z magazynu
            </Button>
          </div>
          {!products.length && (
            <p className="mb-3 rounded-lg border border-orange-800/40 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
              Najpierw dodaj przynajmniej jeden produkt w zakładce Magazyn.
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase text-zinc-500">
                  <th className="px-4 py-2.5">Materiał</th>
                  <th className="px-4 py-2.5">Ilość</th>
                  <th className="px-4 py-2.5">Komentarz</th>
                  <th className="px-4 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody>
                {materialUsages === null ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-zinc-600" /></td></tr>
                ) : materialUsages.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">Brak wpisów</td></tr>
                ) : (
                  materialUsages.map((m) => (
                    <tr key={m.id} className="border-b border-zinc-800 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-100">{m.product.name}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{m.quantity} {m.product.unit}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{m.comment || '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{new Date(m.createdAt).toLocaleDateString('pl-PL')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- DOKUMENTACJA ---- */}
      {tab === 'documentation' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200">Plan budowy</h3>
              {isPrivileged && (
                <Button size="sm" variant="outline" onClick={() => planInputRef.current?.click()} disabled={uploadingPlan} className="border-zinc-700 text-xs text-zinc-300">
                  {uploadingPlan ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />} Wgraj projekt
                </Button>
              )}
              <input ref={planInputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handlePlanFile(e.target.files[0])} />
            </div>
            <div className="flex flex-col gap-2">
              {plans === null ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
              ) : plans.length === 0 ? (
                <p className="text-xs text-zinc-600">Brak wgranych planów.</p>
              ) : (
                plans.map((p) => (
                  <a key={p.id} href={p.fileUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 hover:border-orange-600/40">
                    <FileText className="h-3.5 w-3.5 text-orange-500" /> {p.fileName}
                  </a>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200">Galeria zdjęć</h3>
              <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="border-zinc-700 text-xs text-zinc-300">
                {uploadingPhoto ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Camera className="mr-1 h-3 w-3" />} Dodaj zdjęcie
              </Button>
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handlePhotoFile(e.target.files[0])} />
            </div>
            <input
              value={photoDescription}
              onChange={(e) => setPhotoDescription(e.target.value)}
              placeholder="Opis następnego zdjęcia (opcjonalnie)..."
              className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              {photos === null ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
              ) : photos.length === 0 ? (
                <p className="col-span-3 text-xs text-zinc-600">Brak zdjęć.</p>
              ) : (
                photos.map((p) => (
                  <a key={p.id} href={p.fullResUrl || '#'} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-800">
                    {p.thumbnailUrl && <img src={p.thumbnailUrl} alt={p.description || ''} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
                    {p.description && (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-[10px] text-white">{p.description}</span>
                    )}
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- PODSUMOWANIE ---- */}
      {tab === 'summary' && (
        <div>
          <div className="mb-4 flex items-center justify-between print:hidden">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={clientView} onChange={(e) => setClientView(e.target.checked)} className="accent-orange-600" />
              Wersja dla klienta (bez materiałów)
            </label>
            <Button size="sm" onClick={() => window.print()} className="bg-orange-600 text-white hover:bg-orange-500">
              <Printer className="mr-1 h-3.5 w-3.5" /> Drukuj / Zapisz jako PDF
            </Button>
          </div>

          {!summary ? (
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 print:border-none print:bg-white print:text-black">
              <h2 className="mb-1 text-lg font-semibold text-white print:text-black">Podsumowanie budowy: {summary.site.name}</h2>
              <p className="mb-6 text-sm text-zinc-500 print:text-zinc-700">
                {summary.site.investor} · {summary.site.address}
                {summary.site.completedAt && ` · zakończono ${new Date(summary.site.completedAt).toLocaleDateString('pl-PL')}`}
              </p>

              <h3 className="mb-2 text-sm font-semibold text-orange-500">Wykonane prace</h3>
              <ul className="mb-6 space-y-2 text-sm text-zinc-300 print:text-black">
                {summary.completedWork.length === 0 && <li className="text-zinc-600">Brak zarejestrowanych prac.</li>}
                {summary.completedWork.map((t, i) => (
                  <li key={i} className="border-b border-zinc-800 pb-2 print:border-zinc-300">
                    <strong>{t.title}</strong>{t.description && ` — ${t.description}`}
                    <span className="ml-2 text-xs text-zinc-500">({t.assignees.join(', ') || '—'})</span>
                  </li>
                ))}
              </ul>

              {summary.extraWork.length > 0 && (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-orange-500">Prace dodatkowe</h3>
                  <ul className="mb-6 space-y-2 text-sm text-zinc-300 print:text-black">
                    {summary.extraWork.map((t, i) => (
                      <li key={i} className="border-b border-zinc-800 pb-2 print:border-zinc-300">
                        <strong>{t.title}</strong>{t.description && ` — ${t.description}`}
                        <span className="ml-2 text-xs text-zinc-500">({t.assignees.join(', ') || '—'})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {summary.materialsUsed && (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-orange-500">Wykorzystane materiały</h3>
                  <ul className="space-y-1 text-sm text-zinc-300 print:text-black">
                    {summary.materialsUsed.length === 0 && <li className="text-zinc-600">Brak zarejestrowanego zużycia materiałów.</li>}
                    {summary.materialsUsed.map((m, i) => (
                      <li key={i}>{m.product} — {m.quantity} {m.unit}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- MODALE ---- */}
      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="Nowe zadanie">
        <form onSubmit={handleCreateTask}>
          <label className={labelClass}>Tytuł</label>
          <input required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="np. Montaż gniazd w salonie" className={fieldClass} />
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={taskForm.isExtra} onChange={(e) => setTaskForm({ ...taskForm, isExtra: e.target.checked })} className="accent-orange-600" />
            To praca dodatkowa (poza pierwotnym zakresem)
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTaskModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={savingTask} className="bg-orange-600 text-white hover:bg-orange-500">
              {savingTask ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={materialModalOpen} onClose={() => setMaterialModalOpen(false)} title="Pobranie materiału na budowę">
        <form onSubmit={handleRecordMaterial}>
          <label className={labelClass}>Produkt</label>
          <select required value={materialForm.productId} onChange={(e) => setMaterialForm({ ...materialForm, productId: e.target.value })} className={fieldClass}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label className={labelClass}>Magazyn źródłowy</label>
          <select required value={materialForm.warehouseId} onChange={(e) => setMaterialForm({ ...materialForm, warehouseId: e.target.value })} className={fieldClass}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          <label className={labelClass}>Ilość</label>
          <input required type="number" min="0.01" step="0.01" value={materialForm.quantity} onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })} className={fieldClass} />

          <label className={labelClass}>Komentarz (opcjonalnie)</label>
          <input value={materialForm.comment} onChange={(e) => setMaterialForm({ ...materialForm, comment: e.target.value })} className={fieldClass} />

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
