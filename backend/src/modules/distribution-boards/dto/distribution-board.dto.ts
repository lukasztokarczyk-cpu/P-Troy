import { IsString, IsOptional, IsInt, Min, IsEnum, IsDateString, MinLength } from 'class-validator';
import { DeviceCategory, RcdType, McbCurve } from '@prisma/client';

// ---- Rozdzielnia ----

export class CreateDistributionBoardDto {
  @IsString() @MinLength(1) name: string;
  @IsInt() @Min(1) moduleCount: number;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateDistributionBoardDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() @Min(1) moduleCount?: number;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() description?: string;
}

// ---- Aparat w rozdzielni (różnicówka/bezpiecznik/inny) ----

export class CreateDistributionBoardDeviceDto {
  @IsOptional() @IsInt() @Min(1) position?: number;
  @IsEnum(DeviceCategory) category: DeviceCategory;
  @IsOptional() @IsEnum(RcdType) rcdType?: RcdType;
  @IsOptional() @IsEnum(McbCurve) mcbCurve?: McbCurve;
  @IsOptional() @IsString() ratedCurrent?: string;
  @IsOptional() @IsString() poles?: string;
  @IsOptional() @IsString() manufacturer?: string;
  // Przeznaczenie obwodu — np. "oświetlenie łazienki" (dowolny tekst,
  // to jest sedno tej funkcji: możliwość opisania "co jest gdzie")
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
}

export class UpdateDistributionBoardDeviceDto extends CreateDistributionBoardDeviceDto {}

// ---- Szafa rack/LAN (niezależna od rozdzielni) ----

export class CreateSiteRackDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() @Min(1) unitsCount?: number;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateSiteRackDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() @Min(1) unitsCount?: number;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
}

// ---- PPOŻ ----

export class CreateSiteFireSafetyItemDto {
  @IsString() @MinLength(1) type: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() lastInspectionDate?: string;
  @IsOptional() @IsDateString() nextInspectionDate?: string;
  @IsOptional() @IsString() certificateNumber?: string;
}

export class UpdateSiteFireSafetyItemDto {
  @IsOptional() @IsString() @MinLength(1) type?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() lastInspectionDate?: string;
  @IsOptional() @IsDateString() nextInspectionDate?: string;
  @IsOptional() @IsString() certificateNumber?: string;
}
