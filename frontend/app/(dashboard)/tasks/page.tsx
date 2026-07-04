'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { TaskBoard, TaskItem } from '@/components/tasks/TaskBoard';

export default function TasksPage() {
  const { user, isPrivileged } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);

  const loadTasks = useCallback(() => {
    apiClient<TaskItem[]>('/api/tasks').then(setTasks).catch(() => setTasks([]));
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleStatusChange = async (taskId: string, status: string) => {
    await apiClient(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: { status } }).catch((err) => alert(err.message));
    loadTasks();
  };

  const handleReportProblem = async (taskId: string) => {
    const content = window.prompt('Opisz problem:');
    if (!content) return;
    await apiClient(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { type: 'PROBLEM_REPORT', content } }).catch((err) => alert(err.message));
  };

  const handleReportShortage = async (taskId: string) => {
    const content = window.prompt('Jakich materiałów brakuje?');
    if (!content) return;
    await apiClient(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { type: 'MATERIAL_SHORTAGE', content } }).catch((err) => alert(err.message));
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
      <TaskBoard
        tasks={tasks}
        currentUserId={user.id}
        isPrivileged={isPrivileged}
        onStatusChange={handleStatusChange}
        onReportProblem={handleReportProblem}
        onReportShortage={handleReportShortage}
        onOpenTask={() => {}}
      />
    </div>
  );
}
