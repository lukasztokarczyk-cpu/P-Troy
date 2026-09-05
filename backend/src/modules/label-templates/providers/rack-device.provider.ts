import { Injectable } from '@nestjs/common';
import { LabelTargetType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabelDataProvider, LabelFieldDef, LabelResolvedRecord } from './label-data-provider.interface';

const TYPE_LABELS: Record<string, string> = {
  SWITCH: 'Switch', SWITCH_POE: 'Switch PoE', PATCH_PANEL: 'Patch Panel', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Serwer', UPS: 'UPS', RECORDER: 'Rejestrator', OTHER: 'Inne',
};

@Injectable()
export class RackDeviceLabelProvider implements LabelDataProvider {
  readonly targetType = LabelTargetType.RACK_DEVICE;

  constructor(private readonly prisma: PrismaService) {}

  getAvailableFields(): LabelFieldDef[] {
    return [
      { key: 'deviceName', label: 'Nazwa urządzenia' },
      { key: 'deviceCode', label: 'Kod (= nazwa)' },
      { key: 'deviceType', label: 'Typ urządzenia' },
      { key: 'purpose', label: 'Przeznaczenie' },
      { key: 'unitPosition', label: 'Pozycja U' },
      { key: 'portsCount', label: 'Liczba portów' },
      { key: 'rackName', label: 'Nazwa szafy' },
      { key: 'projectName', label: 'Nazwa budowy' },
    ];
  }

  async resolve(recordId: string): Promise<LabelResolvedRecord | null> {
    const device = await this.prisma.rackDevice.findUnique({
      where: { id: recordId },
      include: { rack: { include: { site: true } } },
    });
    if (!device) return null;
    const bottom = device.startUnit - device.unitsSpan + 1;
    const unitPosition = device.unitsSpan > 1 ? `U${device.startUnit}-U${bottom}` : `U${device.startUnit}`;
    return {
      displayName: device.name,
      targetPath: `/sites/${device.rack.siteId}/racks/${device.rackId}`,
      fields: {
        deviceName: device.name,
        deviceCode: device.name,
        deviceType: TYPE_LABELS[device.type] ?? device.type,
        purpose: device.purpose ?? '',
        unitPosition,
        portsCount: device.portsCount ? String(device.portsCount) : '',
        rackName: device.rack.name,
        projectName: device.rack.site.name,
      },
    };
  }
}
