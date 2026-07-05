'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { TaskBoard, TaskItem } from '@/components/tasks/TaskBoard';
import { Button } from '@/components/ui/button';
import { Modal, fieldClass, labelClass } from '@/components/ui/modal';

interface Site { id: string; name: string; }

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Niski' },
  { value: 'NORMAL', label: 'Normalny' },
  { value: 'HIGH', label: 'Wysoki' },
  { value: 'CRITICAL', label: 'Krytyczny' },
];

// Modal zgłoszenia — wspólny dla "Problem" i "Brak materiałów",
// różni się tylko tytułem/typem komentarza przekazanym z zewnątrz
function ReportModal({
  open, onClose, title, onSubmit,
}: { open: boolean; onClose: () => void; title: string; onSubmit: (content: string) => Promise<void> }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    await onSubmit(content);
    setSubmitting(false);
    setContent('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit}>
        <label className={labelClass}>Opis</label>
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} className={fieldClass} autoFocus />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">Anuluj</Button>
          <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Wyślij
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function TasksPage() {
  const { user, isPrivileged } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', siteId: '', priority: 'NORMAL', dueDate: '' });
  const [submitting, setSubmitting] = useState(false);

  const [problemTaskId, setProblemTaskId] = useState<string | null>(null);
  const [shortageTaskId, setShortageTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(() => {
    apiClient<TaskItem[]>('/api/tasks').then(setTasks).catch(() => setTasks([]));
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => { apiClient<Site[]>('/api/sites').then(setSites).catch(() => setSites([])); }, []);

  const handleStatusChange = async (taskId: string, status: string) => {
    await apiClient(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: { status } }).catch((err) => alert(err.message));
    loadTasks();
  };

  const openCreateModal = () => {
    setCreateForm({ title: '', siteId: sites[0]?.id || '', priority: 'NORMAL', dueDate: '' });
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient('/api/tasks', {
        method: 'POST',
        body: {
          title: createForm.title,
          siteId: createForm.siteId || undefined,
          priority: createForm.priority,
          dueDate: createForm.dueDate || undefined,
          assigneeIds: [],
        },
      });
      setCreateOpen(false);
      loadTasks();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || tasks === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-160px)] animate-fade-in">
      {isPrivileged && (
        <div className="mb-3 flex justify-end">
          <Button onClick={openCreateModal} className="bg-orange-600 text-white hover:bg-orange-500">
            <Plus className="mr-1 h-4 w-4" /> Nowe zadanie
          </Button>
        </div>
      )}

      <TaskBoard
        tasks={tasks}
        currentUserId={user.id}
        isPrivileged={isPrivileged}
        onStatusChange={handleStatusChange}
        onReportProblem={setProblemTaskId}
        onReportShortage={setShortageTaskId}
        onOpenTask={() => {}}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nowe zadanie">
        <form onSubmit={handleCreateSubmit}>
          <label className={labelClass}>Tytuł</label>
          <input required value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} placeholder="np. Podłączenie rozdzielnicy" className={fieldClass} />

          <label className={labelClass}>Budowa (opcjonalnie)</label>
          <select value={createForm.siteId} onChange={(e) => setCreateForm({ ...createForm, siteId: e.target.value })} className={fieldClass}>
            <option value="">— brak —</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Priorytet</label>
              <select value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })} className={fieldClass}>
                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Termin (opcjonalnie)</label>
              <input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} className={fieldClass} />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="border-zinc-700 text-zinc-300">Anuluj</Button>
            <Button type="submit" disabled={submitting} className="bg-orange-600 text-white hover:bg-orange-500">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Zapisz
            </Button>
          </div>
        </form>
      </Modal>

      <ReportModal
        open={!!problemTaskId}
        onClose={() => setProblemTaskId(null)}
        title="Zgłoś problem"
        onSubmit={async (content) => {
          await apiClient(`/api/tasks/${problemTaskId}/comments`, { method: 'POST', body: { type: 'PROBLEM_REPORT', content } }).catch((err) => alert(err.message));
        }}
      />
      <ReportModal
        open={!!shortageTaskId}
        onClose={() => setShortageTaskId(null)}
        title="Zgłoś brak materiałów"
        onSubmit={async (content) => {
          await apiClient(`/api/tasks/${shortageTaskId}/comments`, { method: 'POST', body: { type: 'MATERIAL_SHORTAGE', content } }).catch((err) => alert(err.message));
        }}
      />
    </div>
  );
}
