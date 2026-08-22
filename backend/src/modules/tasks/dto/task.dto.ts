import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  MinLength,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { TaskStatus, TaskPriority, TaskCommentType } from '@prisma/client';

export class CreateTaskDto {
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsInt() @Min(1) plannedMinutes?: number;
  @IsArray() @IsString({ each: true }) assigneeIds: string[];
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsInt() @Min(1) plannedMinutes?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
}

// Zmiana statusu jest osobnym, wąskim endpointem — to właśnie tu
// egzekwujemy dozwolone przejścia i zapisujemy TaskHistory + timestampy.
// reason/summary/comment są warunkowo wymagane w zależności od
// docelowego statusu (patrz TasksService.changeStatus) — stąd tutaj
// wszystkie opcjonalne, walidacja "czy wymagane" leży w serwisie.
export class ChangeTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;

  // Wymagany przy przejściu na WAITING (powód oczekiwania) lub
  // ON_HOLD (powód wstrzymania)
  @IsOptional() @IsString() reason?: string;

  // Wymagany przy przejściu na DONE (podsumowanie wykonania)
  @IsOptional() @IsString() summary?: string;

  // Opcjonalny komentarz dodatkowy przy zakończeniu (DONE)
  @IsOptional() @IsString() comment?: string;
}

export class SetTaskProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress: number;
}

export class AddTaskCommentDto {
  @IsOptional()
  @IsEnum(TaskCommentType)
  type?: TaskCommentType;

  @IsString()
  @MinLength(1)
  content: string;
}

export class TaskFilterDto {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsDateString() dueFrom?: string;
  @IsOptional() @IsDateString() dueTo?: string;
  // "true" jako string z query params — przeliczane w serwisie
  @IsOptional() @IsString() overdue?: string;
}
