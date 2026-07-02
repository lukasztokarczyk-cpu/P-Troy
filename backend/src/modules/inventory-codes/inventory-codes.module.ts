import { Module } from '@nestjs/common';
import { InventoryCodesController } from './inventory-codes.controller';
import { InventoryCodesService } from './inventory-codes.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LabelsModule } from '../../common/labels/labels.module';

@Module({
  imports: [PrismaModule, LabelsModule],
  controllers: [InventoryCodesController],
  providers: [InventoryCodesService],
  exports: [InventoryCodesService],
})
export class InventoryCodesModule {}
