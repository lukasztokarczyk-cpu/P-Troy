import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Ustawienia systemowe jako proste klucz-wartość (SystemSetting) —
 * pozwala administratorowi zmieniać konfigurację (SMTP, logo firmy,
 * motyw, integracje) z panelu, bez redeployu aplikacji. Klucze są
 * zgrupowane prefiksem, np. "smtp.host", "company.name", "theme.accentColor".
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.systemSetting.findMany();
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }

  async findByPrefix(prefix: string) {
    const settings = await this.prisma.systemSetting.findMany({ where: { key: { startsWith: prefix } } });
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }

  async set(key: string, value: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async setMany(entries: Record<string, string>) {
    return this.prisma.$transaction(
      Object.entries(entries).map(([key, value]) =>
        this.prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
      ),
    );
  }
}
