import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SignaturesService } from '../signatures/signatures.service';
import { CreateMeasurementDto } from './dto/measurement.dto';
import { Role } from '@prisma/client';

@Injectable()
export class MeasurementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly signatures: SignaturesService,
  ) {}

  findForSite(siteId: string) {
    return this.prisma.measurement.findMany({
      where: { siteId },
      include: { performedBy: true, photos: true, signableDocument: { include: { signatures: true } } },
      orderBy: { performedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.measurement.findUniqueOrThrow({
      where: { id },
      include: {
        site: true,
        performedBy: true,
        photos: true,
        signableDocument: { include: { signatures: true } },
      },
    });
  }

  /**
   * "Pomiary są automatycznie przypisywane do budowy" + integracja
   * z podpisami: tworzymy pomiar oraz — w tej samej transakcji —
   * powiązany SignableDocument gotowy do podpisania (protokół pomiarowy).
   */
  async create(dto: CreateMeasurementDto, performedById: string) {
    const number = await this.generateNumber();

    const measurement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.measurement.create({
        data: {
          number,
          siteId: dto.siteId,
          performedById,
          description: dto.description,
          results: dto.results as any,
        },
      });

      await tx.signableDocument.create({
        data: {
          type: 'MEASUREMENT_PROTOCOL',
          title: `Protokół pomiarowy ${number}`,
          siteId: dto.siteId,
          measurementId: created.id,
          contentSnapshot: { number, description: dto.description, results: dto.results } as any,
          createdById: performedById,
        },
      });

      return created;
    });

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: dto.siteId } });
    await this.notifications.notifyRoles(['ADMIN', 'KIEROWNIK'], {
      type: 'MEASUREMENT_ADDED',
      title: 'Dodano nowy pomiar',
      message: `Pomiar ${number} dodany na budowie "${site.name}"`,
      entityType: 'Measurement',
      entityId: measurement.id,
    });

    return measurement;
  }

  /**
   * Edycja pomiaru — dozwolona autorowi (performedById) oraz
   * administratorowi/kierownikowi. Celowo NIE MA metody usuwania
   * pomiarów — zgodnie z wymogiem "mogą edytować, ale nie usuwać".
   * Edycja jest blokowana, jeśli powiązany dokument podpisu jest już
   * zablokowany (isLocked) — podpisany protokół jest niemutowalny.
   */
  async update(id: string, dto: Partial<CreateMeasurementDto>, requesterId: string, requesterRole: Role) {
    const measurement = await this.prisma.measurement.findUnique({
      where: { id },
      include: { signableDocument: true },
    });
    if (!measurement) throw new NotFoundException('Pomiar nie został znaleziony');

    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    if (!isPrivileged && measurement.performedById !== requesterId) {
      throw new ForbiddenException('Możesz edytować wyłącznie własne pomiary');
    }
    if (measurement.signableDocument?.isLocked) {
      throw new BadRequestException('Nie można edytować pomiaru — protokół jest już podpisany');
    }

    return this.prisma.measurement.update({
      where: { id },
      data: {
        description: dto.description,
        results: dto.results !== undefined ? (dto.results as any) : undefined,
      },
    });
  }

  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.measurement.count({
      where: { number: { startsWith: `POM/${year}/` } },
    });
    return `POM/${year}/${String(count + 1).padStart(4, '0')}`;
  }
}
