import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsArray,
  IsNumber,
  MinLength,
  ArrayMinSize,
} from 'class-validator';
import {
  ScheduleEventType,
  SchedulePriority,
  ScheduleStatus,
} from '@prisma/client';

export class CreateScheduleEventDto {
  @IsString()
  @MinLength(3, { message: 'Nazwa wydarzenia musi mieć min. 3 znaki' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ScheduleEventType)
  type: ScheduleEventType;

  @IsOptional()
  @IsEnum(SchedulePriority)
  priority?: SchedulePriority;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  // ID pracowników przypisanych do wydarzenia — pracownik zobaczy je
  // wyłącznie jeśli jego ID znajdzie się na tej liście
  @IsArray()
  @ArrayMinSize(1, { message: 'Wydarzenie musi mieć min. 1 przypisaną osobę' })
  @IsString({ each: true })
  assigneeIds: string[];

  // Czy automatycznie utworzyć powiązane Zadanie (integracja modułów)
  @IsOptional()
  @IsBoolean()
  createLinkedTask?: boolean;
}

export class UpdateScheduleEventDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ScheduleEventType) type?: ScheduleEventType;
  @IsOptional() @IsEnum(SchedulePriority) priority?: SchedulePriority;
  @IsOptional() @IsEnum(ScheduleStatus) status?: ScheduleStatus;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
}

// Używane też przez Drag & Drop — przesunięcie wydarzenia bez zmiany
// pozostałych pól, więc osobny lekki endpoint/DTO
export class MoveScheduleEventDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class ScheduleFilterDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsEnum(SchedulePriority) priority?: SchedulePriority;
  @IsOptional() @IsEnum(ScheduleStatus) status?: ScheduleStatus;
}

export class AddScheduleCommentDto {
  @IsString()
  @MinLength(1)
  content: string;
}
