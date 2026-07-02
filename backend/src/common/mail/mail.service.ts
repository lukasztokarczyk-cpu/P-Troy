import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

interface SendMailInput {
  to: string;
  subject: string;
  template: string; // klucz szablonu, np. "schedule-reminder", "welcome", "password-reset"
  context: Record<string, unknown>;
}

/**
 * Konfiguracja SMTP jest wczytywana z SystemSetting (edytowalna przez
 * administratora w Ustawieniach) z fallbackiem do zmiennych środowiskowych
 * — pozwala zmienić serwer pocztowy bez redeployu.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getTransport() {
    const settings = await this.prisma.systemSetting.findMany({
      where: { key: { startsWith: 'smtp.' } },
    });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    return nodemailer.createTransport({
      host: map['smtp.host'] || process.env.SMTP_HOST,
      port: Number(map['smtp.port'] || process.env.SMTP_PORT || 587),
      secure: (map['smtp.secure'] || process.env.SMTP_SECURE) === 'true',
      auth: {
        user: map['smtp.user'] || process.env.SMTP_USER,
        pass: map['smtp.password'] || process.env.SMTP_PASSWORD,
      },
    });
  }

  async send(input: SendMailInput) {
    try {
      const transport = await this.getTransport();
      const html = this.renderTemplate(input.template, input.context);
      await transport.sendMail({
        from: process.env.SMTP_FROM || 'ERP Elektryk <no-reply@erp-elektryk.local>',
        to: input.to,
        subject: input.subject,
        html,
      });
    } catch (err) {
      // Błąd wysyłki e-mail nigdy nie powinien wywalać procesu wywołującego
      // (np. cron przypomnień) — logujemy i pozwalamy retry mechanizmowi zadziałać
      this.logger.error(`Błąd wysyłki e-mail do ${input.to}: ${err.message}`);
      throw err;
    }
  }

  private renderTemplate(template: string, context: Record<string, unknown>): string {
    // Minimalny silnik szablonów — w produkcji podmienić na handlebars/mjml
    switch (template) {
      case 'schedule-reminder':
        return `<div style="font-family:sans-serif;background:#18181b;color:#f4f4f5;padding:24px;border-radius:8px">
          <h2 style="color:#f97316">Przypomnienie o wydarzeniu</h2>
          <p><strong>${context.title}</strong> — ${context.label}</p>
          <p>Data: ${new Date(context.startDate as string).toLocaleString('pl-PL')}</p>
        </div>`;
      case 'welcome':
        return `<div style="font-family:sans-serif;padding:24px">
          <h2>Witamy w systemie ERP</h2>
          <p>Twoje konto zostało utworzone. Login: <strong>${context.login}</strong></p>
        </div>`;
      case 'password-reset':
        return `<div style="font-family:sans-serif;padding:24px">
          <h2>Reset hasła</h2>
          <p>Kliknij, aby ustawić nowe hasło: <a href="${context.resetUrl}">${context.resetUrl}</a></p>
          <p>Link jest ważny 60 minut.</p>
        </div>`;
      default:
        return `<pre>${JSON.stringify(context, null, 2)}</pre>`;
    }
  }
}
