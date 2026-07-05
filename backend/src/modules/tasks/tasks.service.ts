import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import {
  CreateTaskDto,
  UpdateTaskDto,
  ChangeTaskStatusDto,
  SetTaskProgressDto,
  AddTaskCommentDto,
  TaskFilterDto,
} from './dto/task.dto';
import { Role, TaskStatus } from '@prisma/client';

// Dozwolone przejścia statusów dla administratora/kierownika — blokuje
// np. przeskoczenie bezpośrednio z "Nowe" do "Zakończone" z pominięciem realizacji
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING', 'DONE', 'ON_HOLD', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  DONE: [], // stan końcowy — korekta wyłącznie przez administratora (patrz reopen)
  CANCELLED: [],
};

// Instalator NIE modyfikuje zadania — jedyna dozwolona akcja to
// "odznaczenie" wykonania (i odwrócenie tego, jeśli zaznaczył przez
// przypadek). Żadnych innych przejść (Oczekujące, Wstrzymane, Anulowane).
const INSTALLER_ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['DONE'],
  IN_PROGRESS: ['DONE'],
  WAITING: ['DONE'],
  ON_HOLD: ['DONE'],
  DONE: ['IN_PROGRESS'],
  CANCELLED: [],
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async findMany(requesterId: string, requesterRole: Role, filter: TaskFilterDto) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    return this.prisma.task.findMany({
      where: {
        AND: [
          filter.status ? { status: filter.status } : {},
          filter.priority ? { priority: filter.priority } : {},
          filter.siteId ? { siteId: filter.siteId } : {},
          isPrivileged && filter.assigneeId ? { assignees: { some: { userId: filter.assigneeId } } } : {},
          !isPrivileged ? { assignees: { some: { userId: requesterId } } } : {},
        ],
      },
      include: {
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        site: { select: { id: true, name: true } },
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignees: { include: { user: true } },
        attachments: true,
        comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
        history: { include: { user: true }, orderBy: { createdAt: 'desc' } },
        materialUsages: { include: { product: true } },
        site: true,
      },
    });
    if (!task) throw new NotFoundException('Zadanie nie zostało znalezione');
    this.assertVisible(task, requesterId, requesterRole);
    return task;
  }

  async create(dto: CreateTaskDto, createdById: string) {
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        instructions: dto.instructions,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        siteId: dto.siteId,
        createdById,
        assignees: { create: dto.assigneeIds.map((userId) => ({ userId })) },
      },
    });

    await this.notifications.notifyUsers(dto.assigneeIds, {
      type: 'TASK_ASSIGNED',
      title: 'Nowe zadanie',
      message: `Przypisano Ci zadanie: ${task.title}`,
      entityType: 'Task',
      entityId: task.id,
    });
    this.realtime.emitToUsers(dto.assigneeIds, 'tasks:created', { taskId: task.id, title: task.title });

    return task;
  }

  async update(id: string, dto: UpdateTaskDto, requesterId: string, requesterRole: Role) {
    this.assertCanManage(requesterRole);
    const before = await this.findOne(id, requesterId, requesterRole);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          instructions: dto.instructions,
          priority: dto.priority,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          siteId: dto.siteId,
          ...(dto.assigneeIds && {
            assignees: { deleteMany: {}, create: dto.assigneeIds.map((userId) => ({ userId })) },
          }),
        },
      });

      await this.logHistory(tx, id, requesterId, 'assignees', before.assignees.map((a) => a.userId).join(','), dto.assigneeIds?.join(','));
      return updated;
    });
  }

  /**
   * Zmiana statusu — jedyny endpoint, przez który pracownik modyfikuje
   * zadanie. Egzekwuje graf dozwolonych przejść i zapisuje historię.
   */
  async changeStatus(id: string, dto: ChangeTaskStatusDto, requesterId: string, requesterRole: Role) {
    const task = await this.findOne(id, requesterId, requesterRole);

    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    const allowed = isPrivileged ? ALLOWED_TRANSITIONS[task.status] : INSTALLER_ALLOWED_TRANSITIONS[task.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Niedozwolona zmiana statusu z "${task.status}" na "${dto.status}"`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id },
        data: {
          status: dto.status,
          startedAt: dto.status === 'IN_PROGRESS' && !task.startedAt ? new Date() : undefined,
          completedAt: dto.status === 'DONE' ? new Date() : undefined,
          progress: dto.status === 'DONE' ? 100 : undefined,
        },
      });
      await this.logHistory(tx, id, requesterId, 'status', task.status, dto.status);
      return result;
    });

    this.realtime.emitToUsers(
      [task.createdById, ...task.assignees.map((a: any) => a.userId)],
      'tasks:status-changed',
      { taskId: id, status: dto.status },
    );

    return updated;
  }

  async setProgress(id: string, dto: SetTaskProgressDto, requesterId: string, requesterRole: Role) {
    this.assertCanManage(requesterRole);
    const task = await this.findOne(id, requesterId, requesterRole);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.task.update({ where: { id }, data: { progress: dto.progress } });
      await this.logHistory(tx, id, requesterId, 'progress', String(task.progress), String(dto.progress));
      return result;
    });
  }

  async addComment(taskId: string, dto: AddTaskCommentDto, authorId: string) {
    const comment = await this.prisma.taskComment.create({
      data: { taskId, authorId, content: dto.content, type: dto.type ?? 'COMMENT' },
      include: { author: true, task: { select: { createdById: true, title: true } } },
    });

    // Zgłoszenie problemu / braku materiałów trafia jako priorytetowe
    // powiadomienie do administratora i kierownika
    if (dto.type === 'PROBLEM_REPORT' || dto.type === 'MATERIAL_SHORTAGE') {
      await this.notifications.notifyRoles(['ADMIN', 'KIEROWNIK'], {
        type: dto.type,
        title: dto.type === 'PROBLEM_REPORT' ? 'Zgłoszono problem' : 'Zgłoszono brak materiałów',
        message: `Zadanie "${comment.task.title}": ${dto.content}`,
        entityType: 'Task',
        entityId: taskId,
      });
    }

    return comment;
  }

  async remove(id: string, requesterRole: Role) {
    this.assertCanManage(requesterRole);
    return this.prisma.task.delete({ where: { id } });
  }

  // -----------------------------------------------------------------

  private assertVisible(task: any, requesterId: string, requesterRole: Role) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    if (isPrivileged) return;
    const isAssigned = task.assignees.some((a: any) => a.userId === requesterId);
    if (!isAssigned) throw new ForbiddenException('Brak dostępu do tego zadania');
  }

  private assertCanManage(role: Role) {
    if (role !== Role.ADMIN && role !== Role.KIEROWNIK) {
      throw new ForbiddenException('Brak uprawnień do zarządzania zadaniami');
    }
  }

  private async logHistory(
    tx: any,
    taskId: string,
    userId: string,
    field: string,
    oldValue?: string,
    newValue?: string,
  ) {
    if (oldValue === newValue) return;
    await tx.taskHistory.create({ data: { taskId, userId, field, oldValue, newValue } });
  }
}
