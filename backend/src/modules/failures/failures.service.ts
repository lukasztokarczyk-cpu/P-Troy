import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import { CreateFailureDto, UpdateFailureStatusDto, AssignFailureDto } from './dto/failure.dto';
import { Role } from '@prisma/client';

@Injectable()
export class FailuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // Zakładka Awarie jest współdzielona — każdy zalogowany widzi
  // wszystkie zgłoszenia (przejrzystość usterek sprzętu/pojazdów jest
  // korzystna dla całego zespołu), zmieniać status może tylko
  // administrator/brygadzista (patrz updateStatus)
  findAll() {
    return this.prisma.failure.findMany({
      include: {
        reportedBy: { select: { firstName: true, lastName: true } },
        resolvedBy: { select: { firstName: true, lastName: true } },
        site: { select: { id: true, name: true } },
        vehicle: { select: { id: true, brand: true, model: true, registrationNumber: true } },
        scheduleEvent: {
          select: {
            id: true, startDate: true, endDate: true,
            assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, color: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateFailureDto, reportedById: string) {
    const photoPath = dto.photoBase64
      ? await this.storage.saveBase64Image(dto.photoBase64, `failures/${reportedById}/${Date.now()}.png`)
      : undefined;

    const failure = await this.prisma.failure.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        siteId: dto.siteId,
        vehicleId: dto.vehicleId,
        photoPath,
        reportedById,
      },
    });

    await this.notifications.notifyRoles(['ADMIN', 'KIEROWNIK'], {
      type: 'FAILURE_REPORTED',
      title: 'Zgłoszono awarię',
      message: failure.title,
      entityType: 'Failure',
      entityId: failure.id,
    });

    return failure;
  }

  async updateStatus(id: string, dto: UpdateFailureStatusDto, requesterId: string, requesterRole: Role) {
    if (requesterRole !== Role.ADMIN && requesterRole !== Role.KIEROWNIK) {
      throw new ForbiddenException('Tylko administrator lub brygadzista może zmieniać status awarii');
    }
    return this.prisma.failure.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedById: dto.status === 'RESOLVED' ? requesterId : undefined,
        resolvedAt: dto.status === 'RESOLVED' ? new Date() : undefined,
      },
    });
  }

  /**
   * Kieruje instalatora na awarię — tworzy (albo, przy zmianie osoby/
   * godzin, aktualizuje) POWIĄZANE ScheduleEvent (type=FAILURE), dzięki
   * czemu awaria automatycznie pojawia się w Harmonogramie instalatora
   * bez duplikowania jej danych (patrz ScheduleEvent.failureId).
   * Domyślny czas: teraz → +2h, jeśli nie podano — awarie zwykle są
   * pilne i przypisywane "na już", w przeciwieństwie do zaplanowanej
   * z góry budowy.
   */
  async assignInstaller(failureId: string, dto: AssignFailureDto, requesterId: string, requesterRole: Role) {
    if (requesterRole !== Role.ADMIN && requesterRole !== Role.KIEROWNIK) {
      throw new ForbiddenException('Tylko administrator lub brygadzista może przypisywać instalatora do awarii');
    }
    const failure = await this.prisma.failure.findUniqueOrThrow({ where: { id: failureId } });
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

    const existingEvent = await this.prisma.scheduleEvent.findUnique({ where: { failureId } });

    const event = existingEvent
      ? await this.prisma.scheduleEvent.update({
          where: { id: existingEvent.id },
          data: { startDate, endDate, assignees: { deleteMany: {}, create: [{ userId: dto.userId }] } },
        })
      : await this.prisma.scheduleEvent.create({
          data: {
            title: `Awaria: ${failure.title}`,
            type: 'FAILURE',
            priority: failure.priority,
            startDate,
            endDate,
            siteId: failure.siteId ?? undefined,
            failureId,
            createdById: requesterId,
            assignees: { create: [{ userId: dto.userId }] },
          },
        });

    if (failure.status === 'REPORTED') {
      await this.prisma.failure.update({ where: { id: failureId }, data: { status: 'IN_PROGRESS' } });
    }

    await this.notifications.notifyUsers([dto.userId], {
      type: 'FAILURE_ASSIGNED',
      title: 'Przypisano Cię do awarii',
      message: failure.title,
      entityType: 'Failure',
      entityId: failureId,
    });
    this.realtime.emitToUsers([dto.userId], 'schedule:event-created', {
      eventId: event.id, title: event.title, startDate: event.startDate,
    });

    return event;
  }
}
