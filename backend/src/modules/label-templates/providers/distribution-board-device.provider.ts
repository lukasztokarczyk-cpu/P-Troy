import { Injectable } from '@nestjs/common';
import { LabelTargetType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabelDataProvider, LabelFieldDef, LabelResolvedRecord } from './label-data-provider.interface';

const CATEGORY_LABELS: Record<string, string> = { MCB: 'Bezpiecznik', RCD: 'Różnicówka', OTHER: 'Inny aparat' };

function deviceCode(d: { category: string; mcbCurve: string | null; rcdType: string | null; ratedCurrent: string | null }): string {
  if (d.category === 'MCB') return `${d.mcbCurve ?? ''}${d.ratedCurrent ?? ''}`.trim() || 'MCB';
  if (d.category === 'RCD') return `${d.rcdType ?? ''}${d.ratedCurrent ? ' ' + d.ratedCurrent : ''}`.trim() || 'RCD';
  return 'INNY';
}

@Injectable()
export class DistributionBoardDeviceLabelProvider implements LabelDataProvider {
  readonly targetType = LabelTargetType.DISTRIBUTION_BOARD_DEVICE;

  constructor(private readonly prisma: PrismaService) {}

  getAvailableFields(): LabelFieldDef[] {
    return [
      { key: 'deviceCode', label: 'Kod aparatu (np. B16)' },
      { key: 'protectionType', label: 'Typ zabezpieczenia' },
      { key: 'protectionValue', label: 'Prąd znamionowy' },
      { key: 'poleCount', label: 'Liczba biegunów' },
      { key: 'circuitName', label: 'Przeznaczenie obwodu' },
      { key: 'position', label: 'Pozycja/moduł' },
      { key: 'manufacturer', label: 'Producent' },
      { key: 'switchboardName', label: 'Nazwa rozdzielni' },
      { key: 'projectName', label: 'Nazwa budowy' },
    ];
  }

  async resolve(recordId: string): Promise<LabelResolvedRecord | null> {
    const device = await this.prisma.distributionBoardDevice.findUnique({
      where: { id: recordId },
      include: { board: { include: { site: true } } },
    });
    if (!device) return null;
    return {
      displayName: deviceCode(device),
      targetPath: `/sites/${device.board.siteId}`,
      fields: {
        deviceCode: deviceCode(device),
        protectionType: CATEGORY_LABELS[device.category] ?? device.category,
        protectionValue: device.ratedCurrent ?? '',
        poleCount: device.poles ?? '',
        circuitName: device.description ?? '',
        position: device.position ? String(device.position) : '',
        manufacturer: device.manufacturer ?? '',
        switchboardName: device.board.name,
        projectName: device.board.site.name,
      },
    };
  }
}
