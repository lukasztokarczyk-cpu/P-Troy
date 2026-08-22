import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../../common/gateways/realtime.module';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';

@Module({
  imports: [PrismaModule, NotificationsModule, RealtimeModule, TimeTrackingModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService], // wykorzystywane przez ScheduleModule przy auto-tworzeniu zadań
})
export class TasksModule {}
