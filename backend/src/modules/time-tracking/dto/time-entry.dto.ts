import { IsString, IsOptional, IsDateString, Matches } from 'class-validator';

export class ClockInDto {
  @IsOptional() @IsString() siteId?: string;
}

export class CorrectTimeEntryDto {
  @IsDateString() newClockIn: string;
  @IsOptional() @IsDateString() newClockOut?: string;
  @IsString() reason: string;
}

export class TimeReportFilterDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

// Ręczne oznaczenie przepracowanego zakresu godzin (np. 7:00–17:00) —
// alternatywa dla "na żywo" clock-in/clock-out, gdy ktoś zapomni
// rozpocząć/zakończyć na czas albo chce uzupełnić wcześniejszy dzień.
export class CreateManualTimeEntryDto {
  @IsDateString() date: string; // "YYYY-MM-DD"
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Godzina rozpoczęcia musi być w formacie GG:MM' })
  startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Godzina zakończenia musi być w formacie GG:MM' })
  endTime: string;
  @IsOptional() @IsString() siteId?: string;
}
