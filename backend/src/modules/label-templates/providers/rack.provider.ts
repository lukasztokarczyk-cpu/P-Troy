import { Injectable } from '@nestjs/common';
import { LabelTargetType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabelDataProvider, LabelFieldDef, LabelResolvedRecord } from './label-data-provider.interface';

@Injectable()
export class RackLabelProvider implements LabelDataProvider {
  readonly targetType = LabelTargetType.RACK;

  constructor(private readonly prisma: PrismaService) {}

  getAvailableFields(): LabelFieldDef[] {
    return [
      { key: 'rackName', label: 'Nazwa szafy' },
      { key: 'rackLocation', label: 'Lokalizacja' },
      { key: 'unitsCount', label: 'Liczba U' },
      { key: 'manufacturer', label: 'Producent' },
      { key: 'projectName', label: 'Nazwa budowy' },
    ];
  }

  async resolve(recordId: string): Promise<LabelResolvedRecord | null> {
    const rack = await this.prisma.siteRack.findUnique({ where: { id: recordId }, include: { site: true } });
    if (!rack) return null;
    return {
      displayName: rack.name,
      targetPath: `/sites/${rack.siteId}/racks/${rack.id}`,
      fields: {
        rackName: rack.name,
        rackLocation: rack.location ?? '',
        unitsCount: rack.unitsCount ? `${rack.unitsCount}U` : '',
        manufacturer: rack.manufacturer ?? '',
        projectName: rack.site.name,
      },
    };
  }
}
