'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, PackageX, MessageSquare, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'ON_HOLD' | 'CANCELLED';
type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueDate?: string;
  site?: { name: string };
  assignees: { user: { id: string; firstName: string; lastName: string } }[];
}

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'NEW', label: 'Nowe' },
  { key: 'IN_PROGRESS', label: 'W trakcie' },
  { key: 'WAITING', label: 'Oczekujące' },
  { key: 'DONE', label: 'Zakończone' },
  { key: 'ON_HOLD', label: 'Wstrzymane' },
  { key: 'CANCELLED', label: 'Anulowane' },
];

const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  LOW: { label: 'Niski', className: 'bg-zinc-700 text-zinc-200' },
  NORMAL: { label: 'Normalny', className: 'bg-sky-700 text-sky-100' },
  HIGH: { label: 'Wysoki', className: 'bg-orange-600 text-white' },
  CRITICAL: { label: 'Krytyczny', className: 'bg-red-600 text-white' },
};

interface TaskBoardProps {
  tasks: TaskItem[];
  currentUserId: string;
  isPrivileged: boolean;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onReportProblem: (taskId: string) => void;
  onReportShortage: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function TaskBoard({
  tasks,
  currentUserId,
  isPrivileged,
  onStatusChange,
  onReportProblem,
  onReportShortage,
  onOpenTask,
}: TaskBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, TaskItem[]>();
    for (const col of COLUMNS) map.set(col.key, []);
    for (const t of tasks) map.get(t.status)?.push(t);
    return map;
  }, [tasks]);

  return (
    <div className="flex h-full gap-3 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      {COLUMNS.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedId) onStatusChange(draggedId, col.key);
            setDraggedId(null);
          }}
          className="flex w-72 shrink-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-sm font-semibold text-zinc-200">{col.label}</span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
              {grouped.get(col.key)?.length ?? 0}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-2 p-2">
            {(grouped.get(col.key) ?? []).map((task) => (
              <motion.div
                key={task.id}
                layout
                draggable
                onDragStart={() => setDraggedId(task.id)}
                onClick={() => onOpenTask(task.id)}
                whileHover={{ y: -2 }}
                className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-sm transition-colors hover:border-orange-600/40"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h4 className="text-sm font-medium leading-tight text-zinc-100">{task.title}</h4>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_META[task.priority].className}`}>
                    {PRIORITY_META[task.priority].label}
                  </span>
                </div>

                {task.site && (
                  <p className="mb-2 truncate text-xs text-zinc-500">📍 {task.site.name}</p>
                )}

                {/* Pasek postępu — widoczny dla wszystkich, admin widzi też % liczbowo */}
                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                {isPrivileged && (
                  <p className="mb-2 text-right text-[10px] text-zinc-500">{task.progress}%</p>
                )}

                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {task.assignees.length}
                  </span>
                  {task.dueDate && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(task.dueDate).toLocaleDateString('pl-PL')}
                    </span>
                  )}
                </div>

                {/* Szybkie akcje pracownika — widoczne tylko dla przypisanych */}
                {task.assignees.some((a) => a.user.id === currentUserId) &&
                  task.status !== 'DONE' &&
                  task.status !== 'CANCELLED' && (
                    <div className="mt-2 flex gap-1 border-t border-zinc-800 pt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 flex-1 gap-1 px-1 text-[10px] text-amber-400 hover:bg-amber-950/40"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReportProblem(task.id);
                        }}
                      >
                        <AlertTriangle className="h-3 w-3" /> Problem
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 flex-1 gap-1 px-1 text-[10px] text-sky-400 hover:bg-sky-950/40"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReportShortage(task.id);
                        }}
                      >
                        <PackageX className="h-3 w-3" /> Brak materiałów
                      </Button>
                    </div>
                  )}
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
