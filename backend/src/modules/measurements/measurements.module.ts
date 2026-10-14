import { Module } from '@nestjs/common';
import { MeasurementsService } from './measurements.service';
import { MeasurementsController } from './measurements.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { AdminTilesModule } from '../admin-tiles/admin-tiles.module';
import { ProtocolsController } from './protocols/protocols.controller';
import { ProtocolsService } from './protocols/protocols.service';
import { ProtocolPdfService } from './protocols/protocol-pdf.service';
import { ProtocolRemindersProcessor } from './protocols/protocol-reminders.processor';

// Moduł „Pomiary” przebudowany na „Protokoły”. Stary kontroler /api/measurements zostaje
// (dane historyczne), nowa funkcjonalność działa pod /api/protocols.
@Module({
  imports: [AdminTilesModule, PrismaModule, FileStorageModule, NotificationsModule, SignaturesModule],
  controllers: [MeasurementsController, ProtocolsController],
  providers: [MeasurementsService, ProtocolsService, ProtocolPdfService, ProtocolRemindersProcessor],
  exports: [MeasurementsService, ProtocolsService],
})
export class MeasurementsModule {}
