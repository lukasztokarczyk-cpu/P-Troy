import { Injectable } from '@nestjs/common';
import { LabelTargetType } from '@prisma/client';
import { LabelDataProvider } from './label-data-provider.interface';
import { RackLabelProvider } from './rack.provider';
import { RackDeviceLabelProvider } from './rack-device.provider';
import { RackDevicePortLabelProvider } from './rack-device-port.provider';
import { DistributionBoardLabelProvider } from './distribution-board.provider';
import { DistributionBoardDeviceLabelProvider } from './distribution-board-device.provider';

/**
 * Centralny rejestr LabelDataProvider — jedno miejsce, przez które
 * cały system etykiet (szablony, podgląd, druk) dociera do danych
 * konkretnego modułu, bez znajomości jego szczegółów. Dodanie obsługi
 * kolejnego modułu (Sprzęt, Magazyn, Projekty...) to: nowy provider
 * implementujący LabelDataProvider + wpis tutaj + nowa wartość enuma
 * LabelTargetType w schema.prisma.
 */
@Injectable()
export class LabelProviderRegistryService {
  private readonly providers: Map<LabelTargetType, LabelDataProvider>;

  constructor(
    rack: RackLabelProvider,
    rackDevice: RackDeviceLabelProvider,
    rackDevicePort: RackDevicePortLabelProvider,
    board: DistributionBoardLabelProvider,
    boardDevice: DistributionBoardDeviceLabelProvider,
  ) {
    this.providers = new Map<LabelTargetType, LabelDataProvider>([
      [rack.targetType, rack],
      [rackDevice.targetType, rackDevice],
      [rackDevicePort.targetType, rackDevicePort],
      [board.targetType, board],
      [boardDevice.targetType, boardDevice],
    ]);
  }

  get(targetType: LabelTargetType): LabelDataProvider {
    const provider = this.providers.get(targetType);
    if (!provider) throw new Error(`Brak LabelDataProvider dla typu ${targetType}`);
    return provider;
  }
}
