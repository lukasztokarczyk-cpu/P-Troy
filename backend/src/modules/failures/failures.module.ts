import { Module } from '@nestjs/common';
import { FailuresService } from './failures.service';
import { FailuresController } from './failures.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../../common/gateways/realtime.module';

@Module({
  imports: [PrismaModule, FileStorageModule, NotificationsModule, RealtimeModule],
  controllers: [FailuresController],
  providers: [FailuresService],
  exports: [FailuresService],
})
export class FailuresModule {}
