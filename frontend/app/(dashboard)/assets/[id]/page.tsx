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

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxUrl]);

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
    : '-';

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-zinc-800">
            {asset.photos[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.photos[0].url}
                alt={asset.name}
                onClick={() => setLightboxUrl(asset.photos[0].url!)}
                className="h-full w-full cursor-zoom-in object-cover"
              />
