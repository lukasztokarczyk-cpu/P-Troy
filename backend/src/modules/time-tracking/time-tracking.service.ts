import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClockInDto, CorrectTimeEntryDto, TimeReportFilterDto, CreateManualTimeEntryDto } from './dto/time-entry.dto';
import { Role } from '@prisma/client';

@Injectable()
export class TimeTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Pracownik widzi wyłącznie dzisiejszy dzień pracy" — endpoint
   * dedykowany, zwraca tylko wpis z bieżącej daty dla zalogowanego
   * użytkownika, niezależnie od tego, ile ma dostępnych uprawnień.
   */
  async findToday(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.timeEntry.findFirst({
      where: { userId, date: today },
      orderBy: { clockIn: 'desc' },
    });
  }

  async clockIn(userId: string, dto: ClockInDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingOpen = await this.prisma.timeEntry.findFirst({
      where: { userId, date: today, clockOut: null },
    });
    if (existingOpen) {
      throw new BadRequestException('Masz już otwarty dzisiejszy wpis czasu pracy');
    }

    return this.prisma.timeEntry.create({
      data: { userId, date: today, clockIn: new Date(), siteId: dto.siteId },
    });
  }

  async clockOut(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const open = await this.prisma.timeEntry.findFirst({
      where: { userId, date: today, clockOut: null },
    });
    if (!open) throw new BadRequestException('Brak otwartego wpisu czasu pracy do zamknięcia');

    const clockOut = new Date();
    const totalMinutes = Math.round((clockOut.getTime() - open.clockIn.getTime()) / 60000);

    return this.prisma.timeEntry.update({
      where: { id: open.id },
      data: { clockOut, totalMinutes },
    });
  }

  // "Możliwość zaznaczenia czasu pracy od dowolnej godziny do dowolnej,
  // od razu podliczane ile godzin przepracowane" — alternatywa dla
  // "na żywo" clock-in/clock-out, np. uzupełnienie zapomnianego dnia.
  // Zakłada zmianę w obrębie jednej doby (koniec musi być po początku) —
  // do pracy nocnej przechodzącej przez północ potrzebne byłyby dwa wpisy.
  async createManual(userId: string, dto: CreateManualTimeEntryDto) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const [startH, startM] = dto.startTime.split(':').map(Number);
    const [endH, endM] = dto.endTime.split(':').map(Number);

    const clockIn = new Date(date);
    clockIn.setHours(startH, startM, 0, 0);
    const clockOut = new Date(date);
    clockOut.setHours(endH, endM, 0, 0);

    if (clockOut <= clockIn) {
      throw new BadRequestException('Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia');
    }

    const totalMinutes = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000);

    return this.prisma.timeEntry.create({
      data: { userId, date, clockIn, clockOut, totalMinutes, siteId: dto.siteId },
    });
  }

  // Własne wpisy (dowolna rola) — w odróżnieniu od report(), który jest
  // wyłącznie dla administratora/brygadzisty i pozwala filtrować po
  // dowolnym userId. Tu zawsze zwracane są wyłącznie wpisy requestera.
  async findMyEntries(userId: string, from?: string, to?: string) {
    return this.prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { site: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
  }

  // "Administrator widzi pełną historię, raporty, statystyki, filtrowanie"
  async report(filter: TimeReportFilterDto, requesterRole: Role) {
    if (requesterRole !== Role.ADMIN && requesterRole !== Role.KIEROWNIK) {
      throw new ForbiddenException('Brak dostępu do raportów czasu pracy');
    }

    return this.prisma.timeEntry.findMany({
      where: {
        userId: filter.userId,
        date: {
          gte: filter.from ? new Date(filter.from) : undefined,
          lte: filter.to ? new Date(filter.to) : undefined,
        },
      },
      include: { user: true, site: true, corrections: true },
      orderBy: { date: 'desc' },
    });
  }

  // Korekty czasu pracy — wyłącznie administrator, oryginalny wpis
  // pozostaje nienaruszony, korekta jest osobnym rekordem audytowym
  async correct(timeEntryId: string, dto: CorrectTimeEntryDto, correctedById: string, requesterRole: Role) {
    if (requesterRole !== Role.ADMIN) {
      throw new ForbiddenException('Tylko administrator może korygować czas pracy');
    }

    const entry = await this.prisma.timeEntry.findUniqueOrThrow({ where: { id: timeEntryId } });
    const newClockIn = new Date(dto.newClockIn);
    const newClockOut = dto.newClockOut ? new Date(dto.newClockOut) : null;
    const totalMinutes = newClockOut
      ? Math.round((newClockOut.getTime() - newClockIn.getTime()) / 60000)
      : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.timeEntryCorrection.create({
        data: {
          timeEntryId,
          correctedById,
          previousClockIn: entry.clockIn,
          previousClockOut: entry.clockOut,
          newClockIn,
          newClockOut,
          reason: dto.reason,
        },
      });
      return tx.timeEntry.update({
        where: { id: timeEntryId },
        data: { clockIn: newClockIn, clockOut: newClockOut, totalMinutes },
      });
    });
  }
}
