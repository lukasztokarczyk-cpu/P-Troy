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
  @IsArray() @IsString({ each: true }) assigneeIds: string[];
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
}

// Zmiana statusu jest osobnym, wąskim endpointem — to właśnie tu
// egzekwujemy dozwolone przejścia i zapisujemy TaskHistory + timestampy
export class ChangeTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
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
}
