import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global — jedno połączenie z bazą współdzielone przez wszystkie moduły
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
