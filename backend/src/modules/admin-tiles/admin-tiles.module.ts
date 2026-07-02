import { Module } from '@nestjs/common';
import { AdminTilesService } from './admin-tiles.service';
import { AdminTilesController } from './admin-tiles.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminTilesController],
  providers: [AdminTilesService],
  exports: [AdminTilesService],
})
export class AdminTilesModule {}
