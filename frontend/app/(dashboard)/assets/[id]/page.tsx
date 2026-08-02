'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Plus, Wrench, ArrowLeftRight, Check, X as XIcon, Trash2, Pencil } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface AssetDetail {
  id: string; name: string; manufacturer: string | null; model: string | null;
  serialNumber: string | null; purchaseDate: string | null; warrantyEndDate: string | null;
  description: string | null;
  category: { id: string; name: string };
  status: { id: string; name: string; color: string };
  locationType: 'WAREHOUSE' | 'INSTALLER' | 'ADMIN' | 'OTHER';
  warehouse: { id: string; name: string } | null;
  holderUser: { id: string; firstName: string; lastName: string } | null;
  otherHolderText: string | null;
  createdBy: { firstName: string; lastName: string };
  createdAt: string;
  photos: { id: string; url: string | null }[];
  issueReports: {
    id: string; type: 'DAMAGED' | 'TO_REPAIR' | 'IN_SERVICE'; description: string | null;
    photoUrl: string | null; createdAt: string; reportedBy: { firstName: string; lastName: string };
  }[];
  transfers: {
    id: string; status: 'PENDING' | 'CONFIRMED' | 'REJECTED'; rejectReason: string | null; createdAt: string; respondedAt: string | null;
    fromUser: { firstName: string; lastName: string } | null; toUser: { firstName: string; lastName: string }; toUserId: string;
    createdBy: { firstName: string; lastName: string };
  }[];
  history: {
    id: string; previousLocation: string; newLocation: string; statusChange: string | null;
    comment: string | null; createdAt: string; user: { firstName: string; lastName: string };
  }[];
}
interface PersonOption { id: string; firstName: string; lastName: string; role: string; }
interface WarehouseOption { id: string; name: string; }
interface AssetStatusOption { id: string; name: string; color: string; }

const ISSUE_LABELS: Record<string, string> = { DAMAGED: 'Uszkodzony', TO_REPAIR: 'Do naprawy', IN_SERVICE: 'W serwisie' };
const TRANSFER_STATUS_LABELS: Record<string, string> = { PENDING: 'Oczekuje na potwierdzenie', CONFIRMED: 'Potwierdzone', REJECTED: 'Odrzucone' };

const TABS = [
  { key: 'info', label: 'Informacje' },
  { key: 'history', label: 'Historia', adminOnly: true },
  { key: 'photos', label: 'Zdjęcia' },
  { key: 'issues', label: 'Naprawy' },
  { key: 'transfers', label: 'Przekazania' },
] as const;

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isPrivileged, user } = useAuth();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('info');
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [statuses, setStatuses] = useState<AssetStatusOption[]>([]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignType, setAssignType] = useState<'INSTALLER' | 'ADMIN' | 'OTHER'>('INSTALLER');
  const [assignHolderId, setAssignHolderId] = useState('');
  const [assignOtherText, setAssignOtherText] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnWarehouseId, setReturnWarehouseId] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferToId, setTransferToId] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueType, setIssueType] = useState<'DAMAGED' | 'TO_REPAIR' | 'IN_SERVICE'>('DAMAGED');
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePhoto, setIssuePhoto] = useState<File | null>(null);
  const [issueSubmitting, setIssueSubmitting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', manufacturer: '', model: '', serialNumber: '', description: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const loadAsset = useCallback(() => {
    apiClient<AssetDetail>(`/api/assets/${id}`).then(setAsset).catch(() => setAsset(null));
  }, [id]);

  useEffect(() => { loadAsset(); }, [loadAsset]);
  useEffect(() => {
    if (!isPrivileged) return;
    apiClient<PersonOption[]>('/api/users').then(setPeople).catch(() => setPeople([]));
    apiClient<WarehouseOption[]>('/api/warehouse/warehouses').then(setWarehouses).catch(() => setWarehouses([]));
    apiClient<AssetStatusOption[]>('/api/assets/statuses').then(setStatuses).catch(() => setStatuses([]));
  }, [isPrivileged]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const openAssign = () => { setAssignType('INSTALLER'); setAssignHolderId(''); setAssignOtherText(''); setAssignOpen(true); };
  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignSubmitting(true);
    try {
      await apiClient(`/api/assets/${id}/assign`, {
        method: 'POST',
        body: { locationType: assignType, holderUserId: assignType !== 'OTHER' ? assignHolderId : undefined, otherHolderText: assignType === 'OTHER' ? assignOtherText : undefined },
      });
      setAssignOpen(false);
      loadAsset();
    } catch (err: any) { alert(err.message); } finally { setAssignSubmitting(false); }
  };

  const openReturn = () => { setReturnWarehouseId(warehouses[0]?.id ?? ''); setReturnOpen(true); };
  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setReturnSubmitting(true);
    try {
      await apiClient(`/api/assets/${id}/return`, { method: 'POST', body: { warehouseId: returnWarehouseId } });
      setReturnOpen(false);
      loadAsset();
    } catch (err: any) { alert(err.message); } finally { setReturnSubmitting(false); }
  };

  const openTransfer = () => { setTransferToId(''); setTransferOpen(true); };
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferSubmitting(true);
    try {
      await apiClient(`/api/assets/${id}/transfer`, { method: 'POST', body: { toUserId: transferToId } });
      setTransferOpen(false);
      loadAsset();
    } catch (err: any) { alert(err.message); } finally { setTransferSubmitting(false); }
  };

  const handleConfirmTransfer = async (transferId: string) => {
    await apiClient(`/api/assets/transfers/${transferId}/confirm`, { method: 'POST' }).catch((err) => alert(err.message));
    loadAsset();
  };
  const handleRejectTransfer = async (transferId: string) => {
    const reason = window.prompt('Powód odrzucenia (opcjonalnie):') || undefined;
    await apiClient(`/api/assets/transfers/${transferId}/reject`, { method: 'POST', body: { reason } }).catch((err) => alert(err.message));
    loadAsset();
  };

  const openIssue = () => { setIssueType('DAMAGED'); setIssueDescription(''); setIssuePhoto(null); setIssueOpen(true); };
  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssueSubmitting(true);
    try {
      const photoBase64 = issuePhoto ? await fileToBase64(issuePhoto) : undefined;
      await apiClient(`/api/assets/${id}/issues`, { method: 'POST', body: { type: issueType, description: issueDescription || undefined, photoBase64 } });
      setIssueOpen(false);
      loadAsset();
    } catch (err: any) { alert(err.message); } finally { setIssueSubmitting(false); }
  };

  const handleSetStatus = async (statusId: string) => {
    await apiClient(`/api/assets/${id}/status`, { method: 'PATCH', body: { statusId } }).catch((err) => alert(err.message));
    loadAsset();
  };

  const openEdit = () => {
    if (!asset) return;
    setEditForm({
      name: asset.name, manufacturer: asset.manufacturer ?? '', model: asset.model ?? '',
      serialNumber: asset.serialNumber ?? '', description: asset.description ?? '',
    });
    setEditOpen(true);
  };
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSubmitting(true);
    try {
      await apiClient(`/api/assets/${id}`, { method: 'PATCH', body: editForm });
      setEditOpen(false);
      loadAsset();
    } catch (err: any) { alert(err.message); } finally { setEditSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Usunąć ten sprzęt na stałe? Tej operacji nie można cofnąć.')) return;
    try {
      await apiClient(`/api/assets/${id}`, { method: 'DELETE' });
      window.location.href = '/assets';
    } catch (err: any) { alert(err.message); }
  };

  if (!asset) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  const installerOptions = people.filter((p) => p.role === 'INSTALATOR');
  const adminOptions = people.filter((p) => p.role === 'ADMIN');
  const locationText = asset.locationType === 'WAREHOUSE'
    ? `Magazyn: ${asset.warehouse?.name ?? '—'}`
    : asset.locationType === 'OTHER'
    ? asset.otherHolderText || 'Inne'
    : asset.holderUser
    ? `${asset.locationType === 'ADMIN' ? 'Administrator' : 'Instalator'}: ${asset.holderUser.firstName} ${asset.holderUser.lastName}`
    : '—';

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-zinc-800">
            {asset.photos[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.photos[0].url} alt={asset.name} className="h-full w-full object-cover" />
            ) : (
              <Wrench className="h-6 w-6 text-zinc-600" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">{asset.name}</h1>
            <p className="text-sm text-zinc-500">{asset.category.name} · {locationText}</p>
          </div>
        </div>
        {isPrivileged && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={openEdit} className="border-zinc-700 text-zinc-300"><Pencil className="h-3.5 w-3.5" /></Button>
            {user?.role === 'ADMIN' && (
              <Button size="sm" variant="outline" onClick={handleDelete} className="border-red-800 text-red-400 hover:bg-red-950"><Trash2 className="h-3.5 w-3.5" /></Button>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-800">
        {TABS.filter((t) => !('adminOnly' in t && t.adminOnly) || isPrivileged).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-b-2 border-orange-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- INFORMACJE ---- */}
      {tab === 'info' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm sm:grid-cols-3">
            <div><p className="text-zinc-500">Status</p><span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${asset.status.color}26`, color: asset.status.color }}>{asset.status.name}</span></div>
            <div><p className="text-zinc-500">Producent</p><p className="text-zinc-200">{asset.manufacturer || '—'}</p></div>
            <div><p className="text-zinc-500">Model</p><p className="text-zinc-200">{asset.model || '—'}</p></div>
            <div><p className="text-zinc-500">Nr seryjny</p><p className="text-zinc-200">{asset.serialNumber || '—'}</p></div>
            <div><p className="text-zinc-500">Data zakupu</p><p className="text-zinc-200">{asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString('pl-PL') : '—'}</p></div>
            <div><p className="text-zinc-500">Koniec gwarancji</p><p className="text-zinc-200">{asset.warrantyEndDate ? new Date(asset.warrantyEndDate).toLocaleDateString('pl-PL') : '—'}</p></div>
            {asset.description && <div className="col-span-full"><p className="text-zinc-500">Opis</p><p className="text-zinc-200">{asset.description}</p></div>}
          </div>

          {isPrivileged && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={openAssign} className="bg-orange-600 text-white hover:bg-orange-500">Wydaj sprzęt</Button>
              <Button size="sm" variant="outline" onClick={openReturn} className="border-zinc-700 text-zinc-300">Sprzęt wrócił</Button>
              <Button size="sm" variant="outline" onClick={openTransfer} className="border-zinc-700 text-zinc-300">
                <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Przekaż instalatorowi
              </Button>
              <select
                value={asset.status.id}
                onChange={(e) => handleSetStatus(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 focus:border-orange-500 focus:outline-none"
              >
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ---- HISTORIA (tylko admin/brygadzista) ---- */}
      {tab === 'history' && isPrivileged && (
        <div className="space-y-2">
          {asset.history.length === 0 && <p className="text-sm text-zinc-500">Brak zdarzeń historii.</p>}
          {asset.history.map((h) => (
            <div key={h.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <p className="text-zinc-200">{h.previousLocation} → {h.newLocation}</p>
              {h.statusChange && <p className="text-xs text-zinc-500">Status: {h.statusChange}</p>}
              {h.comment && <p className="text-xs text-zinc-500">{h.comment}</p>}
              <p className="mt-1 text-xs text-zinc-600">{h.user.firstName} {h.user.lastName} · {new Date(h.createdAt).toLocaleString('pl-PL')}</p>
            </div>
          ))}
        </div>
      )}

      {/* ---- ZDJĘCIA ---- */}
      {tab === 'photos' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {asset.photos.length === 0 && <p className="col-span-full text-sm text-zinc-500">Brak zdjęć.</p>}
          {asset.photos.map((p) => p.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt={asset.name} className="aspect-square rounded-lg object-cover" />
          ))}
        </div>
      )}

      {/* ---- NAPRAWY ---- */}
      {tab === 'issues' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openIssue} className="bg-orange-600 text-white hover:bg-orange-500"><Plus className="mr-1 h-3.5 w-3.5" /> Zgłoś usterkę</Button>
          </div>
          {asset.issueReports.length === 0 && <p className="text-sm text-zinc-500">Brak zgłoszeń.</p>}
          {asset.issueReports.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <p className="font-medium text-zinc-100">{ISSUE_LABELS[r.type]}</p>
              {r.description && <p className="text-zinc-400">{r.description}</p>}
              {r.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photoUrl} alt="Zdjęcie usterki" className="mt-2 h-24 w-24 rounded-lg object-cover" />
              )}
              <p className="mt-1 text-xs text-zinc-600">{r.reportedBy.firstName} {r.reportedBy.lastName} · {new Date(r.createdAt).toLocaleString('pl-PL')}</p>
            </div>
          ))}
        </div>
      )}

      {/* ---- PRZEKAZANIA ---- */}
      {tab === 'transfers' && (
        <div className="space-y-3">
          {asset.transfers.length === 0 && <p className="text-sm text-zinc-500">Brak przekazań.</p>}
          {asset.transfers.map((t) => (
            <div key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <p className="text-zinc-200">
                {t.fromUser ? `${t.fromUser.firstName} ${t.fromUser.lastName}` : 'Magazyn/brak'} → {t.toUser.firstName} {t.toUser.lastName}
              </p>
              <p className="text-xs text-zinc-500">{TRANSFER_STATUS_LABELS[t.status]}{t.rejectReason ? ` — ${t.rejectReason}` : ''}</p>
              <p className="mt-1 text-xs text-zinc-600">Zainicjował: {t.createdBy.firstName} {t.createdBy.lastName} · {new Date(t.createdAt).toLocaleString('pl-PL')}</p>
              {t.status === 'PENDING' && t.toUserId === user?.id && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => handleConfirmTransfer(t.id)} className="bg-emerald-700 text-white hover:bg-emerald-600"><Check className="mr-1 h-3.5 w-3.5" /> Potwierdź odbiór</Button>
                  <Button size="sm" variant="outline" onClick={() => handleRejectTransfer(t.id)} className="border-red-800 text-red-400 hover:bg-red-950"><XIcon className="mr-1 h-3.5 w-3.5" /> Odrzuć</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---- MODALE ---- */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Wydaj sprzęt">
        <form onSubmit={handleAssign}>
          <label className={labelClass}>Komu wydać</label>
          <select value={assignType} onChange={(e) => setAssignType(e.target.value as any)} className={fieldClass}>
            <option value="INSTALLER">Instalator</option>
            <option value="ADMIN">Administrator</option>
            <option value="OTHER">Inne</option>
          </select>

          {assignType !== 'OTHER' && (
            <>
              <label className={labelClass}>Osoba</label>
              <select required value={assignHolderId} onChange={(e) => setAssignHolderId(e.target.value)} className={fieldClass}>
                <option value="">Wybierz…</option>
                {(assignType === 'INSTALLER' ? installerOptions : adminOptions).map((p) => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </select>
            </>
          )}
          {assignType === 'OTHER' && (
            <>
              <label className={labelClass}>Opis (dowolny tekst)</label>
              <input required value={assignOtherText} onChange={(e) => setAssignOtherText(e.target.value)} placeholder="np. Serwis Bosch, Wypożyczone klientowi" className={fieldClass} />
            </>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAssignOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={assignSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {assignSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Sprzęt wrócił">
        <form onSubmit={handleReturn}>
          <label className={labelClass}>Magazyn docelowy</label>
          <select required value={returnWarehouseId} onChange={(e) => setReturnWarehouseId(e.target.value)} className={fieldClass}>
            <option value="">Wybierz…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReturnOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={returnSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {returnSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Przekaż instalatorowi">
        <form onSubmit={handleTransfer}>
          <label className={labelClass}>Przekaż do</label>
          <select required value={transferToId} onChange={(e) => setTransferToId(e.target.value)} className={fieldClass}>
            <option value="">Wybierz instalatora…</option>
            {installerOptions.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
          </select>
          <p className="text-xs text-zinc-500">Instalator otrzyma powiadomienie i będzie musiał potwierdzić odbiór.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTransferOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={transferSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {transferSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Wyślij
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Zgłoś usterkę">
        <form onSubmit={handleReportIssue}>
          <label className={labelClass}>Rodzaj zgłoszenia</label>
          <select value={issueType} onChange={(e) => setIssueType(e.target.value as any)} className={fieldClass}>
            <option value="DAMAGED">Uszkodzony</option>
            <option value="TO_REPAIR">Do naprawy</option>
            <option value="IN_SERVICE">W serwisie</option>
          </select>
          <label className={labelClass}>Opis usterki (opcjonalnie)</label>
          <textarea rows={3} value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} className={fieldClass} />
          <label className={labelClass}>Zdjęcie (opcjonalnie)</label>
          <input type="file" accept="image/*" onChange={(e) => setIssuePhoto(e.target.files?.[0] || null)} className={fieldClass} />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIssueOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={issueSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {issueSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zgłoś
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edytuj sprzęt">
        <form onSubmit={handleEdit}>
          <label className={labelClass}>Nazwa</label>
          <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={fieldClass} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Producent</label>
              <input value={editForm.manufacturer} onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} className={fieldClass} />
            </div>
          </div>
          <label className={labelClass}>Numer seryjny</label>
          <input value={editForm.serialNumber} onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} className={fieldClass} />
          <label className={labelClass}>Opis</label>
          <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={fieldClass} />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={editSubmitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {editSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
