import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LabelsModule } from '../../common/labels/labels.module';
import { LabelTemplatesController } from './label-templates.controller';
import { PrintJobsController } from './print-jobs.controller';
import { LabelTemplatesService } from './label-templates.service';
import { PrintJobsService } from './print-jobs.service';
import { LabelProviderRegistryService } from './providers/label-provider-registry.service';
import { RackLabelProvider } from './providers/rack.provider';
import { RackDeviceLabelProvider } from './providers/rack-device.provider';
import { RackDevicePortLabelProvider } from './providers/rack-device-port.provider';
import { DistributionBoardLabelProvider } from './providers/distribution-board.provider';
import { DistributionBoardDeviceLabelProvider } from './providers/distribution-board-device.provider';

@Module({
  imports: [PrismaModule, LabelsModule],
  controllers: [LabelTemplatesController, PrintJobsController],
  providers: [
    LabelTemplatesService,
    PrintJobsService,
    LabelProviderRegistryService,
    RackLabelProvider,
    RackDeviceLabelProvider,
    RackDevicePortLabelProvider,
    DistributionBoardLabelProvider,
    DistributionBoardDeviceLabelProvider,
  ],
  exports: [LabelProviderRegistryService],
})
export class LabelTemplatesModule {}
