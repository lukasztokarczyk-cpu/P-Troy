import { Module } from '@nestjs/common';
import { PdfGeneratorService } from './pdf-generator.service';
import { FileStorageModule } from '../storage/file-storage.module';

@Module({
  imports: [FileStorageModule],
  providers: [PdfGeneratorService],
  exports: [PdfGeneratorService],
})
export class PdfModule {}
