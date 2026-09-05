import { Injectable } from '@nestjs/common';
import { LabelTargetType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabelDataProvider, LabelFieldDef, LabelResolvedRecord } from './label-data-provider.interface';

const CONNECTION_LABELS: Record<string, string> = {
  LAN_SOCKET: 'Gniazdko LAN', CAMERA: 'Kamera', ACCESS_POINT: 'Access Point', SWITCH: 'Switch',
  SWITCH_POE: 'Switch PoE', PATCH_PANEL: 'Patch Panel', ROUTER: 'Router', SERVER: 'Serwer',
  RECORDER: 'Rejestrator', OTHER: 'Inne',
};

@Injectable()
export class RackDevicePortLabelProvider implements LabelDataProvider {
  readonly targetType = LabelTargetType.RACK_DEVICE_PORT;

  constructor(private readonly prisma: PrismaService) {}

  getAvailableFields(): LabelFieldDef[] {
    return [
      { key: 'portNumber', label: 'Numer portu' },
      { key: 'connectionType', label: 'Typ podłączenia' },
      { key: 'label', label: 'Nazwa / przeznaczenie' },
      { key: 'location', label: 'Lokalizacja' },
      { key: 'deviceName', label: 'Nazwa urządzenia (switch/patch panel)' },
      { key: 'rackName', label: 'Nazwa szafy' },
      { key: 'projectName', label: 'Nazwa budowy' },
    ];
  }

  async resolve(recordId: string): Promise<LabelResolvedRecord | null> {
    const port = await this.prisma.rackDevicePort.findUnique({
      where: { id: recordId },
      include: { device: { include: { rack: { include: { site: true } } } } },
    });
    if (!port) return null;
    return {
      displayName: `Port ${port.portNumber}`,
      targetPath: `/sites/${port.device.rack.siteId}/racks/${port.device.rackId}`,
      fields: {
        portNumber: String(port.portNumber),
        connectionType: port.connectionType ? CONNECTION_LABELS[port.connectionType] ?? port.connectionType : '',
        label: port.label ?? '',
        location: port.location ?? '',
        deviceName: port.device.name,
        rackName: port.device.rack.name,
        projectName: port.device.rack.site.name,
      },
    };
  }
}
