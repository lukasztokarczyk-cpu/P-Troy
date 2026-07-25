'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Send, Mail, MailOpen } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface DirectoryUser { id: string; firstName: string; lastName: string; role: string; }
interface MessageItem {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; firstName: string; lastName: string };
  recipients: { userId: string; readAt: string | null; user: { id: string; firstName: string; lastName: string } }[];
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator', KIEROWNIK: 'Brygadzista', INSTALATOR: 'Instalator', MAGAZYNIER: 'Magazynier',
};

export default function MessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [content, setContent] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadMessages = useCallback(() => {
    apiClient<MessageItem[]>('/api/messages/inbox').then(setMessages).catch(() => setMessages([]));
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => {
    apiClient<DirectoryUser[]>('/api/users/directory').then((list) => setDirectory(list.filter((u) => u.id !== user?.id))).catch(() => setDirectory([]));
  }, [user]);

  const openModal = () => {
    setContent('');
    setRecipientIds([]);
    setModalOpen(true);
  };

  const toggleRecipient = (id: string) => {
    setRecipientIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientIds.length) { alert('Wybierz przynajmniej jednego odbiorcę.'); return; }
    setSubmitting(true);
    try {
      await apiClient('/api/messages', { method: 'POST', body: { content, recipientIds } });
      setModalOpen(false);
      loadMessages();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpen = async (m: MessageItem) => {
    if (m.sender.id !== user?.id) {
      await apiClient(`/api/messages/${m.id}/read`, { method: 'PATCH' }).catch(() => undefined);
      loadMessages();
    }
  };

  if (messages === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Komunikator</h1>
          <p className="text-sm text-zinc-500">Wiadomości widoczne wyłącznie dla Ciebie i wybranych odbiorców.</p>
        </div>
        <Button onClick={openModal} className="bg-orange-600 text-white hover:bg-orange-500">
          <Plus className="mr-1 h-4 w-4" /> Nowa wiadomość
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {messages.map((m) => {
          const isOwn = m.sender.id === user?.id;
          const myRecipient = m.recipients.find((r) => r.userId === user?.id);
          const unread = !isOwn && myRecipient && !myRecipient.readAt;
          return (
            <button
              key={m.id}
              onClick={() => handleOpen(m)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${unread ? 'border-orange-600/50 bg-orange-950/10' : 'border-zinc-800 bg-zinc-900'}`}
            >
              {unread ? <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /> : <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />}
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-100">
                    {isOwn ? `Ty → ${m.recipients.map((r) => `${r.user.firstName} ${r.user.lastName}`).join(', ')}` : `${m.sender.firstName} ${m.sender.lastName}`}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-600">{new Date(m.createdAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="truncate text-sm text-zinc-400">{m.content}</p>
              </div>
            </button>
          );
        })}
        {messages.length === 0 && <p className="py-12 text-center text-sm text-zinc-500">Brak wiadomości.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nowa wiadomość">
        <form onSubmit={handleSubmit}>
          <label className={labelClass}>Odbiorcy</label>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-2">
            {directory.length === 0 && <p className="text-xs text-zinc-600">Brak innych użytkowników.</p>}
            {directory.map((u) => (
              <label key={u.id} className="flex items-center gap-2 py-1 text-sm text-zinc-200">
                <input type="checkbox" checked={recipientIds.includes(u.id)} onChange={() => toggleRecipient(u.id)} className="accent-orange-600" />
                {u.firstName} {u.lastName} <span className="text-xs text-zinc-600">({ROLE_LABELS[u.role] ?? u.role})</span>
              </label>
            ))}
          </div>

          <label className={labelClass}>Treść</label>
          <textarea required rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Treść wiadomości..." className={fieldClass} />

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Wyślij
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
