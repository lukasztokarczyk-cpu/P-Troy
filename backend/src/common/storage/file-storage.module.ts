import { Module, Global } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';
import { FilesController } from './files.controller';

@Global()
@Module({
  controllers: [FilesController],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}