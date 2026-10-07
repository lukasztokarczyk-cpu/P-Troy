import { Module } from '@nestjs/common';
import { DistributionBoardsService } from './distribution-boards.service';
import { DistributionBoardsController } from './distribution-boards.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { DistributionBoardsPdfService } from './distribution-boards-pdf.service';

@Module({
  imports: [PrismaModule, FileStorageModule],
  controllers: [DistributionBoardsController],
  providers: [DistributionBoardsService, DistributionBoardsPdfService],
})
export class DistributionBoardsModule {}
