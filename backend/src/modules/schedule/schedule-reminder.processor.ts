import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import { MailService } from '../../common/mail/mail.service';

/**
 * Uruchamia się co minutę i wysyła wszystkie zaległe przypomnienia,
 * których scheduledFor <= teraz oraz sentAt jest puste.
 * Zaprojektowane idempotentnie: unikalny indeks (eventId, userId,
 * offset, channel) + kolumna sentAt gwarantują brak duplikatów
 * nawet przy równoległych instancjach backendu.
 */
@Injectable()
export class ScheduleReminderProcessor {
  private readonly logger = new Logger(ScheduleReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueReminders() {
    const dueReminders = await this.prisma.scheduleReminder.findMany({
      where: { sentAt: null, scheduledFor: { lte: new Date() } },
      include: { event: true, user: true },
      take: 200, // batch, żeby nie zablokować worker'a przy dużej liczbie zaległości
    });

    for (const reminder of dueReminders) {
      try {
        await this.dispatch(reminder);
        await this.prisma.scheduleReminder.update({
          where: { id: reminder.id },
          data: { sentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Błąd wysyłki przypomnienia ${reminder.id}: ${err.message}`);
        await this.prisma.scheduleReminder.update({
          where: { id: reminder.id },
          data: { failedAt: new Date(), failReason: String(err.message).slice(0, 500) },
        });
      }
    }
  }

  private async dispatch(reminder: any) {
    const label = this.offsetLabel(reminder.offset);
    const message = `Przypomnienie: "${reminder.event.title}" — ${label}`;

    switch (reminder.channel) {
      case 'IN_APP':
        await this.notifications.create({
          userId: reminder.userId,
          type: 'SCHEDULE_REMINDER',
          title: 'Nadchodzące wydarzenie',
          message,
          entityType: 'ScheduleEvent',
          entityId: reminder.eventId,
        });
        break;
      case 'PUSH':
        await this.notifications.sendPush(reminder.userId, {
          title: 'Nadchodzące wydarzenie',
          body: message,
          data: { eventId: reminder.eventId },
        });
        break;
      case 'EMAIL':
        if (reminder.user.email && reminder.user.emailNotificationsEnabled) {
          await this.mail.send({
            to: reminder.user.email,
            subject: 'Przypomnienie o wydarzeniu',
            template: 'schedule-reminder',
            context: { title: reminder.event.title, label, startDate: reminder.event.startDate },
          });
        }
        break;
    }

    // Odświeżenie widoku w czasie rzeczywistym u zalogowanego użytkownika
    this.realtime.emitToUsers([reminder.userId], 'schedule:reminder', {
      eventId: reminder.eventId,
      title: reminder.event.title,
      offset: reminder.offset,
    });
  }

  private offsetLabel(offset: string) {
    switch (offset) {
      case 'ONE_DAY_BEFORE':
        return 'jutro';
      case 'ONE_HOUR_BEFORE':
        return 'za godzinę';
      case 'FIFTEEN_MIN_BEFORE':
        return 'za 15 minut';
      default:
        return '';
    }
  }
}
