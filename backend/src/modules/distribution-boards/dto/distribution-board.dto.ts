import { IsString, IsOptional, IsInt, Min, IsEnum, IsDateString, MinLength } from 'class-validator';
import { DeviceCategory, RcdType, McbCurve, RackDeviceType, PortConnectionType } from '@prisma/client';

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

// ---- Urządzenie w szafie rack (odwzorowanie pozycji U) ----

export class CreateRackDeviceDto {
  @IsString() @MinLength(1) name: string;
  @IsEnum(RackDeviceType) type: RackDeviceType;
  @IsOptional() @IsString() purpose?: string;
  @IsInt() @Min(1) startUnit: number;
  @IsOptional() @IsInt() @Min(1) unitsSpan?: number;
  // Tylko dla SWITCH/SWITCH_POE/PATCH_PANEL — liczba portów do
  // automatycznego utworzenia. Dla innych typów pomijane.
  @IsOptional() @IsInt() @Min(1) portsCount?: number;
  @IsOptional() @IsString() description?: string;
}

export class UpdateRackDeviceDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsEnum(RackDeviceType) type?: RackDeviceType;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsInt() @Min(1) startUnit?: number;
  @IsOptional() @IsInt() @Min(1) unitsSpan?: number;
  // Zmiana liczby portów: jeśli zmniejszona, serwer ostrzega (409),
  // chyba że force=true (patrz kontroler).
  @IsOptional() @IsInt() @Min(1) portsCount?: number;
  @IsOptional() @IsString() description?: string;
}

// ---- Port urządzenia sieciowego (switch/patch panel) ----

export class UpdateRackDevicePortDto {
  @IsOptional() @IsEnum(PortConnectionType) connectionType?: PortConnectionType;
  @IsOptional() @IsString() label?: string;
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
