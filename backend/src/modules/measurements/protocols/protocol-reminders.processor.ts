import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProtocolsService } from './protocols.service';

/**
 * Codzienne przypomnienia o terminie kolejnego badania, o 07:00 czasu polskiego.
 * Cała logika (progi 14/7/0 dni, po terminie, „nadrabianie”, brak duplikatów)
 * jest w ProtocolsService.runReminders — tu tylko wyzwalacz.
 */
@Injectable()
export class ProtocolRemindersProcessor {
  private readonly logger = new Logger(ProtocolRemindersProcessor.name);

  constructor(private readonly protocols: ProtocolsService) {}

  @Cron('0 7 * * *', { timeZone: 'Europe/Warsaw' })
  async dailyReminders() {
    try {
      const res = await this.protocols.runReminders();
      this.logger.log(`Przypomnienia o terminach badań: sprawdzono ${res.checked}, wysłano ${res.sent}`);
    } catch (err) {
      // Błąd crona nie może wywrócić aplikacji.
      this.logger.error(`Przypomnienia o terminach badań nie powiodły się: ${(err as Error).message}`);
    }
  }
}
