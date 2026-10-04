import {
  IsString, IsOptional, IsInt, Min, Max, IsNumber, IsBoolean, IsArray, ArrayMaxSize,
  IsIn, ValidateNested, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KIND_KEYS, FRAME_DEVICE_KEYS, BOX_TYPE_KEYS, FRAME_ORIENTATIONS, MAX_FRAME_BOXES } from '../plan-catalog';

// Jedna puszka w ramce: aparat + obwód + linie + sterowanie smart
export class FrameBoxDto {
  @IsString() @IsIn(FRAME_DEVICE_KEYS) device: string;
  @IsOptional() @IsString() @MaxLength(60) style?: string;
  @IsOptional() @IsString() circuitDeviceId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(12, { each: true }) lines?: string[];
  @IsOptional() @IsBoolean() smart?: boolean;
  @IsOptional() @IsString() @IsIn(BOX_TYPE_KEYS) boxType?: string | null;
}

export class FrameDto {
  @IsInt() @Min(1) @Max(MAX_FRAME_BOXES) count: number;
  @IsString() @IsIn(FRAME_ORIENTATIONS as unknown as string[]) orientation: string;
  @IsOptional() @IsString() @MaxLength(60) style?: string;
  @IsArray() @ArrayMaxSize(MAX_FRAME_BOXES) @ValidateNested({ each: true }) @Type(() => FrameBoxDto) boxes: FrameBoxDto[];
}

export class CreatePlanPointDto {
  @IsNumber() @Min(0) @Max(1) x: number;
  @IsNumber() @Min(0) @Max(1) y: number;
  @IsOptional() @IsInt() @Min(1) @Max(500) page?: number;
  @IsString() @IsIn(KIND_KEYS) kind: string;
  @IsOptional() @IsString() subtype?: string;
  @IsOptional() @IsString() circuitDeviceId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(12, { each: true }) lines?: string[];
  @IsOptional() @IsBoolean() smart?: boolean;
  @IsOptional() @IsString() @IsIn(BOX_TYPE_KEYS) boxType?: string | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
  @IsOptional() @ValidateNested() @Type(() => FrameDto) frame?: FrameDto;
}

export class UpdatePlanPointDto {
  @IsOptional() @IsNumber() @Min(0) @Max(1) x?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) y?: number;
  @IsOptional() @IsString() subtype?: string;
  @IsOptional() @IsString() circuitDeviceId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(12, { each: true }) lines?: string[];
  @IsOptional() @IsBoolean() smart?: boolean;
  @IsOptional() @IsString() @IsIn(BOX_TYPE_KEYS) boxType?: string | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
  @IsOptional() @ValidateNested() @Type(() => FrameDto) frame?: FrameDto;
}
