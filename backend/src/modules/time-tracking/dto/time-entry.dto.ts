import { IsString, IsOptional, IsDateString } from 'class-validator';

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
