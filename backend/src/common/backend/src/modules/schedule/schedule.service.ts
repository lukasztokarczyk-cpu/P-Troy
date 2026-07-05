import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import {
  CreateScheduleEventDto,
  UpdateScheduleEventDto,
  MoveScheduleEventDto,
  ScheduleFilterDto,
  AddScheduleCommentDto,
} from './dto/schedule-event.dto';
import { ReminderChannel, ReminderOffset, Role } from '@prisma/client';

// Przesunięcia czasowe przypomnień w milisekundach — pojedyncze źródło
// prawdy używane zarówno przy tworzeniu jak i przy odczycie
const REMINDER_OFFSETS_MS: Record<ReminderOffset, number> = {
  ONE_DAY_BEFORE: 24 * 60 * 60 * 1000,
  ONE_HOUR_BEFORE: 60 * 60 * 1000,
  FIFTEEN_MIN_BEFORE: 15 * 60 * 1000,
};

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Zwraca wydarzenia w zadanym zakresie dat.
   * Administrator/Kierownik widzą wszystko (z opcjonalnymi filtrami).
   * Pracownik (Instalator/Magazynier) widzi WYŁĄCZNIE wydarzenia,
   * do których został przypisany — egzekwowane na poziomie zapytania,
   * nie tylko UI.
   */
  async findMany(
    requesterId: string,
    requesterRole: Role,
    filter: ScheduleFilterDto,
  ) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;

    return this.prisma.scheduleEvent.findMany({
      where: {
        AND: [
          filter.from || filter.to
            ? {
                startDate: filter.from ? { gte: new Date(filter.from) } : undefined,
                endDate: filter.to ? { lte: new Date(filter.to) } : undefined,
              }
            : {},
          filter.siteId ? { siteId: filter.siteId } : {},
          filter.vehicleId ? { vehicleId: filter.vehicleId } : {},
          filter.priority ? { priority: filter.priority } : {},
          filter.status ? { status: filter.status } : {},
          // Filtr po konkretnym pracowniku — dozwolony tylko dla uprzywilejowanych
          isPrivileged && filter.userId
            ? { assignees: { some: { userId: filter.userId } } }
            : {},
          // Twarde ograniczenie widoczności dla zwykłego pracownika
          !isPrivileged ? { assignees: { some: { userId: requesterId } } } : {},
        ],
      },
      include: {
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        site: { select: { id: true, name: true } },
        vehicle: { select: { id: true, registrationNumber: true } },
        attachments: true,
        _count: { select: { comments: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const event = await this.prisma.scheduleEvent.findUnique({
      where: { id },
      include: {
        assignees: { include: { user: true } },
        attachments: true,
        comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
        site: true,
        vehicle: true,
      },
    });
    if (!event) throw new NotFoundException('Wydarzenie nie zostało znalezione');
    this.assertVisible(event, requesterId, requesterRole);
    return event;
  }

  async create(dto: CreateScheduleEventDto, createdById: string, requesterRole: Role) {
    // Instalator może dodawać wydarzenia wyłącznie dla samego siebie —
    // niezależnie co przyszło w dto.assigneeIds, nadpisujemy to na
    // [createdById]. Admin/kierownik mogą przypisywać kogo chcą.
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    const effectiveAssigneeIds = isPrivileged ? dto.assigneeIds : [createdById];

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.scheduleEvent.create({
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type,
          priority: dto.priority,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          allDay: dto.allDay ?? false,
          location: dto.location,
          latitude: dto.latitude,
          longitude: dto.longitude,
          siteId: dto.siteId,
          vehicleId: dto.vehicleId,
          createdById,
          assignees: {
            create: effectiveAssigneeIds.map((userId) => ({ userId })),
          },
        },
        include: { assignees: true },
      });

      // Integracja: harmonogram może automatycznie tworzyć zadania
      if (dto.createLinkedTask) {
        await tx.task.create({
          data: {
            title: created.title,
            description: created.description,
            dueDate: created.endDate,
            siteId: created.siteId,
            createdById,
            assignees: { create: effectiveAssigneeIds.map((userId) => ({ userId })) },
            sourceEvent: { connect: { id: created.id } },
          },
        });
      }

      await this.scheduleReminders(tx, created.id, created.startDate, effectiveAssigneeIds);
      return created;
    });

    // Powiadomienie w czasie rzeczywistym (WebSocket) dla przypisanych osób
    this.realtime.emitToUsers(effectiveAssigneeIds, 'schedule:event-created', {
      eventId: event.id,
      title: event.title,
      startDate: event.startDate,
    });

    return event;
  }

  async update(id: string, dto: UpdateScheduleEventDto, requesterId: string, requesterRole: Role) {
    const existing = await this.findOne(id, requesterId, requesterRole);
    this.assertCanEdit(requesterRole);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.scheduleEvent.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type,
          priority: dto.priority,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          allDay: dto.allDay,
          location: dto.location,
          siteId: dto.siteId,
          vehicleId: dto.vehicleId,
          ...(dto.assigneeIds && {
            assignees: {
              deleteMany: {},
              create: dto.assigneeIds.map((userId) => ({ userId })),
            },
          }),
        },
      });

      // Jeśli data startu się zmieniła — przelicz przypomnienia
      if (dto.startDate) {
        await tx.scheduleReminder.deleteMany({ where: { eventId: id, sentAt: null } });
        const assigneeIds = dto.assigneeIds ?? existing.assignees.map((a) => a.userId);
        await this.scheduleReminders(tx, id, result.startDate, assigneeIds);
      }

      return result;
    });

    this.realtime.emitToUsers(
      dto.assigneeIds ?? existing.assignees.map((a) => a.userId),
      'schedule:event-updated',
      { eventId: id },
    );

    return updated;
  }

  /**
   * Drag & Drop — szybka zmiana terminu bez przesyłania całego obiektu.
   */
  async move(id: string, dto: MoveScheduleEventDto, requesterId: string, requesterRole: Role) {
    this.assertCanEdit(requesterRole);
    const event = await this.findOne(id, requesterId, requesterRole);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.scheduleEvent.update({
        where: { id },
        data: { startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
      });
      await tx.scheduleReminder.deleteMany({ where: { eventId: id, sentAt: null } });
      await this.scheduleReminders(
        tx,
        id,
        result.startDate,
        event.assignees.map((a) => a.userId),
      );
      return result;
    });

    this.realtime.emitToUsers(
      event.assignees.map((a) => a.userId),
      'schedule:event-moved',
      { eventId: id, startDate: updated.startDate, endDate: updated.endDate },
    );

    return updated;
  }

  async remove(id: string, requesterRole: Role) {
    this.assertCanEdit(requesterRole);
    return this.prisma.scheduleEvent.delete({ where: { id } });
  }

  async addComment(eventId: string, dto: AddScheduleCommentDto, authorId: string) {
    return this.prisma.scheduleComment.create({
      data: { eventId, authorId, content: dto.content },
      include: { author: true },
    });
  }

  // -----------------------------------------------------------------
  // Prywatne pomocnicze
  // -----------------------------------------------------------------

  private assertVisible(event: any, requesterId: string, requesterRole: Role) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    if (isPrivileged) return;
    const isAssigned = event.assignees.some((a: any) => a.userId === requesterId);
    if (!isAssigned) {
      throw new ForbiddenException('Brak dostępu do tego wydarzenia');
    }
  }

  private assertCanEdit(role: Role) {
    if (role !== Role.ADMIN && role !== Role.KIEROWNIK) {
      throw new ForbiddenException('Tylko administrator lub kierownik może edytować harmonogram');
    }
  }

  /**
   * Tworzy rekordy ScheduleReminder dla wszystkich kombinacji
   * offset × kanał × przypisany użytkownik. Faktyczna wysyłka odbywa
   * się w ScheduleReminderProcessor (cron), który odpytuje o rekordy
   * z scheduledFor <= now() i sentAt = null.
   */
  private async scheduleReminders(
    tx: any,
    eventId: string,
    startDate: Date,
    userIds: string[],
  ) {
    const offsets = Object.keys(REMINDER_OFFSETS_MS) as ReminderOffset[];
    const channels: ReminderChannel[] = ['IN_APP', 'PUSH', 'EMAIL'];

    const data = userIds.flatMap((userId) =>
      offsets.flatMap((offset) =>
        channels.map((channel) => ({
          eventId,
          userId,
          offset,
          channel,
          scheduledFor: new Date(startDate.getTime() - REMINDER_OFFSETS_MS[offset]),
        })),
      ),
    );

    if (data.length) {
      await tx.scheduleReminder.createMany({ data, skipDuplicates: true });
    }
  }
}
