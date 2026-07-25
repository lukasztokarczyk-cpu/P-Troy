import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateFailureDto, UpdateFailureStatusDto } from './dto/failure.dto';
import { Role } from '@prisma/client';

@Injectable()
export class FailuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly notifications: NotificationsService,
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
}
