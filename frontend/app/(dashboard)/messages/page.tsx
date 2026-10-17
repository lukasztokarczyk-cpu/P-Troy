'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Send, Mail, MailOpen } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface DirectoryUser { id: string; firstName: string; lastName: string; role: string; }
interface Person { id: string; firstName: string; lastName: string }
interface ThreadMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: Person;
  recipients: { userId: string; readAt: string | null; user: Person }[];
}
interface MessageItem extends ThreadMessage {
  replies?: ThreadMessage[];
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator', KIEROWNIK: 'Brygadzista', INSTALATOR: 'Instalator', MAGAZYNIER: 'Magazynier',
};

const fmt = (iso: string) => new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fullName = (p: Person) => `${p.firstName} ${p.lastName}`;

export default function MessagesPage() {
  // useSearchParams wymaga granicy Suspense przy budowaniu strony
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>}>
      <Messages />
    </Suspense>
  );
}

function Messages() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const targetParam = params?.get('message') ?? null;

  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [content, setContent] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [thread, setThread] = useState<MessageItem | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const loadMessages = useCallback(() => {
    apiClient<MessageItem[]>('/api/messages/inbox').then(setMessages).catch(() => setMessages((m) => m ?? []));
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => {
    apiClient<DirectoryUser[]>('/api/users/directory').then((list) => setDirectory(list.filter((u) => u.id !== user?.id))).catch(() => setDirectory([]));
  }, [user]);

  // Odświeżanie w tle: lista co 20 s, otwarta rozmowa co 8 s (nowe wiadomości pojawiają się same)
  useEffect(() => {
    if (thread) return;
    const t = setInterval(loadMessages, 20000);
    return () => clearInterval(t);
  }, [thread, loadMessages]);

  const markRead = useCallback((id: string) => {
    apiClient(`/api/messages/${id}/read`, { method: 'PATCH' }).then(loadMessages).catch(() => undefined);
  }, [loadMessages]);

  /** Otwiera rozmowę z serwera (działa dla wiadomości głównej i odpowiedzi — także z powiadomienia). */
  const openByMessageId = useCallback(async (id: string, focus: string | null) => {
    setNotice('');
    try {
      const t = await apiClient<MessageItem>(`/api/messages/${id}/thread`);
      setThread(t);
      setTargetId(focus);
      setReply('');
      setReplyError('');
      markRead(t.id);
    } catch (e: any) {
      setThread(null);
      setNotice(e?.status === 403 ? 'Nie masz uprawnień do tej wiadomości.' : e?.status === 404 ? 'Ta wiadomość już nie istnieje.' : (e?.message || 'Nie udało się otworzyć wiadomości.'));
    }
  }, [markRead]);

  // Wejście z powiadomienia: /messages?message=<id>
  useEffect(() => {
    if (targetParam) openByMessageId(targetParam, targetParam);
  }, [targetParam, openByMessageId]);

  // Przewinięcie do wiadomości z powiadomienia + chwilowe podświetlenie
  useEffect(() => {
    if (!thread || !targetId) return;
    const el = document.querySelector<HTMLElement>(`[data-message-id="${targetId}"]`);
    if (!el) return;
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    setHighlightId(targetId);
    const t = setTimeout(() => setHighlightId(null), 3500);
    return () => clearTimeout(t);
  }, [thread?.id, targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Odświeżanie otwartej rozmowy
  useEffect(() => {
    if (!thread) return;
    const id = thread.id;
    const t = setInterval(() => {
      apiClient<MessageItem>(`/api/messages/${id}/thread`).then((fresh) => {
        setThread((cur) => {
          if (!cur || cur.id !== id) return cur;
          if ((fresh.replies?.length ?? 0) > (cur.replies?.length ?? 0)) markRead(id);
          return fresh;
        });
      }).catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, [thread?.id, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeThread = () => {
    setThread(null);
    setTargetId(null);
    setHighlightId(null);
    if (targetParam) router.replace('/messages');
    loadMessages();
  };

  const sendReply = async () => {
    if (!thread || sendingRef.current) return;
    const text = reply.trim();
    if (!text) { setReplyError('Wpisz treść odpowiedzi.'); return; }
    sendingRef.current = true;
    setSending(true);
    setReplyError('');
    try {
      const created = await apiClient<ThreadMessage>(`/api/messages/${thread.id}/reply`, { method: 'POST', body: { content: text } });
      setThread((cur) => (cur && cur.id === thread.id ? { ...cur, replies: [...(cur.replies ?? []), created] } : cur));
      setReply('');
      setTargetId(null);
      setTimeout(() => bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }), 30);
    } catch (e: any) {
      setReplyError(e?.message || 'Nie udało się wysłać odpowiedzi. Spróbuj ponownie.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

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

  if (messages === null && !thread) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  // ------------------------------------------------------------ widok rozmowy
  if (thread) {
    const all: ThreadMessage[] = [thread, ...(thread.replies ?? [])];
    const people = new Map<string, string>();
    all.forEach((m) => { people.set(m.sender.id, fullName(m.sender)); m.recipients.forEach((r) => people.set(r.userId, fullName(r.user))); });
    const others = Array.from(people.entries()).filter(([id]) => id !== user?.id).map(([, n]) => n);
    return (
      <div className="mx-auto flex max-w-3xl flex-col animate-fade-in" data-testid="thread-view">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={closeThread} className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800" aria-label="Wróć do listy"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-white">Rozmowa: {others.join(', ') || 'tylko Ty'}</h1>
            <p className="text-xs text-zinc-500">{all.length} wiad.</p>
          </div>
        </div>

        <div className="space-y-2 pb-4" data-testid="thread-messages">
          {all.map((m) => {
            const own = m.sender.id === user?.id;
            const hl = highlightId === m.id;
            return (
              <div key={m.id} data-message-id={m.id} data-highlighted={hl ? 'true' : 'false'} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl border px-3 py-2 transition-all duration-500 ${own ? 'border-orange-700/40 bg-orange-950/30' : 'border-zinc-800 bg-zinc-900'} ${hl ? 'bg-orange-500/30 ring-2 ring-orange-500' : ''}`}>
                  <p className="text-xs text-zinc-500">{own ? 'Ty' : fullName(m.sender)} · {fmt(m.createdAt)}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-100">{m.content}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="sticky bottom-0 -mx-4 border-t border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
          {replyError && <p className="mb-2 rounded-lg bg-red-950/50 p-2 text-xs text-red-300" role="alert">{replyError}</p>}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); } }}
              placeholder="Napisz odpowiedź…"
              aria-label="Odpowiedź"
              className={`${fieldClass} min-h-[44px] flex-1 text-base`}
            />
            <Button onClick={sendReply} disabled={sending} className="h-11 bg-orange-600 px-4 text-white hover:bg-orange-500" data-testid="reply-send">
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Wyślij
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ lista rozmów
  const list = messages ?? [];
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

      {notice && (
        <p className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200" role="alert" data-testid="msg-notice">
          <span>{notice}</span>
          <button className="text-xs text-amber-400 underline" onClick={() => { setNotice(''); if (targetParam) router.replace('/messages'); }}>Zamknij</button>
        </p>
      )}

      <div className="flex flex-col gap-2">
        {list.map((m) => {
          const msgs = [m, ...(m.replies ?? [])];
          const last = msgs[msgs.length - 1];
          const isOwnLast = last.sender.id === user?.id;
          const unread = msgs.some((x) => x.sender.id !== user?.id && x.recipients.some((r) => r.userId === user?.id && !r.readAt));
          const partners = Array.from(new Set(msgs.flatMap((x) => [x.sender, ...x.recipients.map((r) => r.user)]).filter((p) => p.id !== user?.id).map(fullName)));
          return (
            <button
              key={m.id}
              data-testid="thread-row"
              onClick={() => openByMessageId(m.id, null)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${unread ? 'border-orange-600/50 bg-orange-950/10' : 'border-zinc-800 bg-zinc-900'}`}
            >
              {unread ? <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /> : <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />}
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">{partners.join(', ') || 'Ty'}{msgs.length > 1 && <span className="ml-2 text-xs text-zinc-500">({msgs.length})</span>}</span>
                  <span className="shrink-0 text-xs text-zinc-600">{fmt(last.createdAt)}</span>
                </div>
                <p className="truncate text-sm text-zinc-400">{isOwnLast ? 'Ty: ' : ''}{last.content}</p>
              </div>
            </button>
          );
        })}
        {list.length === 0 && <p className="py-12 text-center text-sm text-zinc-500">Brak wiadomości.</p>}
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
