import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { AdminTilesModule } from '../admin-tiles/admin-tiles.module';
import { PlanPointsController } from './plan-points.controller';
import { PlanPointsService } from './plan-points.service';
import { PlanPointsPdfService } from './plan-points-pdf.service';

@Module({
  imports: [PrismaModule, FileStorageModule, AdminTilesModule],
  controllers: [PlanPointsController],
  providers: [PlanPointsService, PlanPointsPdfService],
})
export class PlanPointsModule {}
