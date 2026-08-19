import { Module, Global } from '@nestjs/common';
import { DirectAdminService } from './directadmin.service';

@Global()
@Module({
  providers: [DirectAdminService],
  exports: [DirectAdminService],
})
export class DirectAdminModule {}
