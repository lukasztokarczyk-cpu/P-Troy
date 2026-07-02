import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SignaturesService } from '../signatures/signatures.service';
import { CreateMeasurementDto } from './dto/measurement.dto';

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
          contentSnapshot: { number, description: dto.description, results: dto.results },
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

  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.measurement.count({
      where: { number: { startsWith: `POM/${year}/` } },
    });
    return `POM/${year}/${String(count + 1).padStart(4, '0')}`;
  }
}
