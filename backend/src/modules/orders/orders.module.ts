import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminTilesModule } from '../admin-tiles/admin-tiles.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersPdfService } from './orders-pdf.service';

@Module({
  imports: [AdminTilesModule, PrismaModule, FileStorageModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersPdfService],
})
export class OrdersModule {}
