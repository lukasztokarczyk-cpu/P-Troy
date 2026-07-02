import { Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { ScheduleReminderProcessor } from './schedule-reminder.processor';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../../common/gateways/realtime.module';
import { MailModule } from '../../common/mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    RealtimeModule,
    MailModule,
    NestScheduleModule.forRoot(), // rejestruje mechanizm @Cron globalnie (no-op jeśli już zarejestrowany w AppModule)
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService, ScheduleReminderProcessor],
  exports: [ScheduleService], // np. do wywołania z modułu Budowy (Site) przy tworzeniu wydarzenia
})
export class ScheduleModule {}
