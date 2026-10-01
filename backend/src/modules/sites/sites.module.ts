import { Module } from '@nestjs/common';
import { SitesService } from './sites.service';
import { SitesController } from './sites.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { AdminTilesModule } from '../admin-tiles/admin-tiles.module';

@Module({
  imports: [AdminTilesModule, PrismaModule, NotificationsModule, FileStorageModule],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
