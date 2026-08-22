import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import { TimeTrackingService } from '../time-tracking/time-tracking.service';
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

// Przepływ realizowany przez instalatora podczas pracy nad zadaniem:
// Nowe → W trakcie → (Oczekujące/Wstrzymane ↔ W trakcie) → Zakończone.
// Każde wejście w "W trakcie" uruchamia naliczanie czasu (moduł Czas
// pracy), każde wyjście z "W trakcie" je zatrzymuje — patrz changeStatus.
const INSTALLER_ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING', 'ON_HOLD', 'DONE'],
  WAITING: ['IN_PROGRESS'],
  ON_HOLD: ['IN_PROGRESS'],
  DONE: [],
  CANCELLED: [],
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly timeTracking: TimeTrackingService,
  ) {}

  async findMany(requesterId: string, requesterRole: Role, filter: TaskFilterDto) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    const isOverdue = filter.overdue === 'true';
    return this.prisma.task.findMany({
      where: {
        AND: [
          filter.status ? { status: filter.status } : {},
          filter.priority ? { priority: filter.priority } : {},
          filter.siteId ? { siteId: filter.siteId } : {},
          isPrivileged && filter.assigneeId ? { assignees: { some: { userId: filter.assigneeId } } } : {},
          !isPrivileged ? { assignees: { some: { userId: requesterId } } } : {},
          filter.dueFrom ? { dueDate: { gte: new Date(filter.dueFrom) } } : {},
          filter.dueTo ? { dueDate: { lte: new Date(filter.dueTo) } } : {},
          // "Opóźnione" — termin już minął, a zadanie wciąż nie jest
          // ani zakończone, ani anulowane
          isOverdue ? { dueDate: { lt: new Date() }, status: { notIn: ['DONE', 'CANCELLED'] } } : {},
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
        // Rzeczywisty czas pracy — patrz punkty 8/9 specyfikacji: suma +
        // rozbicie dzień-po-dniu, wyliczane niżej z surowych wpisów,
        // żeby wspierać zadania wielodniowe i wielokrotne wznowienia.
        timeEntries: { orderBy: { date: 'asc' } },
      },
    });
    if (!task) throw new NotFoundException('Zadanie nie zostało znalezione');
    this.assertVisible(task, requesterId, requesterRole);

    const actualMinutes = task.timeEntries.reduce((sum, e) => sum + (e.totalMinutes ?? 0), 0);
    return { ...task, actualMinutes };
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
        plannedMinutes: dto.plannedMinutes,
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
          plannedMinutes: dto.plannedMinutes,
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
   * zadanie. Egzekwuje graf dozwolonych przejść, wymaga powodu przy
   * przejściu na Oczekujące/Wstrzymane oraz podsumowania przy
   * Zakończone (patrz specyfikacja przepływu Harmonogram→Zadania),
   * zapisuje pełną historię i steruje naliczaniem czasu pracy.
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

    if (dto.status === 'WAITING' && !dto.reason?.trim()) {
      throw new BadRequestException('Podaj powód oczekiwania');
    }
    if (dto.status === 'ON_HOLD' && !dto.reason?.trim()) {
      throw new BadRequestException('Podaj powód wstrzymania');
    }
    if (dto.status === 'DONE' && !dto.summary?.trim()) {
      throw new BadRequestException('Podaj podsumowanie wykonania zadania');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id },
        data: {
          status: dto.status,
          startedAt: dto.status === 'IN_PROGRESS' && !task.startedAt ? new Date() : undefined,
          completedAt: dto.status === 'DONE' ? new Date() : undefined,
          progress: dto.status === 'DONE' ? 100 : undefined,
          waitReason: dto.status === 'WAITING' ? dto.reason!.trim() : undefined,
          holdReason: dto.status === 'ON_HOLD' ? dto.reason!.trim() : undefined,
          completionSummary: dto.status === 'DONE' ? dto.summary!.trim() : undefined,
          completionComment: dto.status === 'DONE' ? (dto.comment?.trim() || undefined) : undefined,
        },
      });
      await this.logHistory(tx, id, requesterId, 'status', task.status, dto.status);
      if (dto.status === 'WAITING') await this.logHistory(tx, id, requesterId, 'waitReason', undefined, dto.reason);
      if (dto.status === 'ON_HOLD') await this.logHistory(tx, id, requesterId, 'holdReason', undefined, dto.reason);
      if (dto.status === 'DONE') await this.logHistory(tx, id, requesterId, 'completionSummary', undefined, dto.summary);
      return result;
    });

    // Integracja z modułem Czas pracy — celowo POZA transakcją Prisma
    // powyżej (osobny, niezależny mechanizm zapisu); ewentualna awaria
    // tej integracji nie może zablokować samej zmiany statusu zadania.
    // Śledzimy czas WYŁĄCZNIE osoby wykonującej tę zmianę (requesterId),
    // zgodnie z założeniem, że to instalator zmienia status podczas
    // własnej realizacji zadania (patrz specyfikacja, punkt 3 i 6).
    try {
      if (dto.status === 'IN_PROGRESS') {
        await this.timeTracking.startForTask(requesterId, id, task.siteId);
      } else if (dto.status === 'WAITING' || dto.status === 'ON_HOLD' || dto.status === 'DONE') {
        await this.timeTracking.stopForTask(requesterId, id);
      }
    } catch {
      // brak integracji czasu nie blokuje zmiany statusu — błąd celowo
      // pochłonięty, użytkownik i tak dostaje poprawny wynik zmiany statusu
    }

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
