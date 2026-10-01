import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { VehicleInspectionProcessor } from './vehicle-inspection.processor';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminTilesModule } from '../admin-tiles/admin-tiles.module';

@Module({
  imports: [AdminTilesModule, PrismaModule, NotificationsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehicleInspectionProcessor],
  exports: [VehiclesService],
})
export class VehiclesModule {}
