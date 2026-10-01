import { Module } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';
import { TimeTrackingController } from './time-tracking.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AdminTilesModule } from '../admin-tiles/admin-tiles.module';

@Module({
  imports: [AdminTilesModule, PrismaModule],
  controllers: [TimeTrackingController],
  providers: [TimeTrackingService],
  exports: [TimeTrackingService],
})
export class TimeTrackingModule {}
