import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { PdfModule } from '../../common/pdf/pdf.module';

@Module({
  imports: [PrismaModule, FileStorageModule, PdfModule],
  controllers: [SignaturesController],
  providers: [SignaturesService],
  exports: [SignaturesService], // wywoływane z modułu Pomiary przy generowaniu protokołu
})
export class SignaturesModule {}
