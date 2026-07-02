import { Module } from '@nestjs/common';
import { LabelPrinterService } from './label-printer.service';
import { FileStorageModule } from '../storage/file-storage.module';

@Module({
  imports: [FileStorageModule],
  providers: [LabelPrinterService],
  exports: [LabelPrinterService],
})
export class LabelsModule {}
