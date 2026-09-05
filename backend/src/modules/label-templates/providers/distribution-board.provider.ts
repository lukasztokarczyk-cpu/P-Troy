import { Injectable } from '@nestjs/common';
import { LabelTargetType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabelDataProvider, LabelFieldDef, LabelResolvedRecord } from './label-data-provider.interface';

@Injectable()
export class DistributionBoardLabelProvider implements LabelDataProvider {
  readonly targetType = LabelTargetType.DISTRIBUTION_BOARD;

  constructor(private readonly prisma: PrismaService) {}

  getAvailableFields(): LabelFieldDef[] {
    return [
      { key: 'switchboardName', label: 'Nazwa rozdzielni' },
      { key: 'location', label: 'Lokalizacja / opis' },
      { key: 'manufacturer', label: 'Producent' },
      { key: 'moduleCount', label: 'Liczba modułów DIN' },
      { key: 'projectName', label: 'Nazwa budowy' },
    ];
  }

  async resolve(recordId: string): Promise<LabelResolvedRecord | null> {
    const board = await this.prisma.distributionBoard.findUnique({ where: { id: recordId }, include: { site: true } });
    if (!board) return null;
    return {
      displayName: board.name,
      targetPath: `/sites/${board.siteId}`,
      fields: {
        switchboardName: board.name,
        location: board.description ?? '',
        manufacturer: board.manufacturer ?? '',
        moduleCount: String(board.moduleCount),
        projectName: board.site.name,
      },
    };
  }
}
