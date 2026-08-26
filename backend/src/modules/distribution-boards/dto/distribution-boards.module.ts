import { Module } from '@nestjs/common';
import { DistributionBoardsService } from './distribution-boards.service';
import { DistributionBoardsController } from './distribution-boards.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DistributionBoardsController],
  providers: [DistributionBoardsService],
})
export class DistributionBoardsModule {}
