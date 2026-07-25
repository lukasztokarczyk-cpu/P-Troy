import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';
import { SchedulePriority, FailureStatus } from '@prisma/client';

export class CreateFailureDto {
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(SchedulePriority) priority?: SchedulePriority;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() photoBase64?: string;
}

export class UpdateFailureStatusDto {
  @IsEnum(FailureStatus)
  status: FailureStatus;
}
