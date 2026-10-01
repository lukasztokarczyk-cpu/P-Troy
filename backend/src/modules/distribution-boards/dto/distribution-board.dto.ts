import { IsString, IsOptional, IsInt, Min, Max, IsEnum, IsDateString, MinLength, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceCategory, RcdType, McbCurve, RackDeviceType, PortConnectionType } from '@prisma/client';

// ---- Rozdzielnia ----

// Jedna szyna DIN: ile modułów (miejsc na bezpieczniki/aparaty) ma na sobie.
// `id` podaje się tylko przy edycji istniejącej szyny.
export class RailInputDto {
  @IsOptional() @IsString() id?: string;
  @IsInt() @Min(1) @Max(200) moduleCount: number;
}

export class CreateDistributionBoardDto {
  @IsString() @MinLength(1) name: string;
  // Nowy sposób: lista szyn (kolejność = numer szyny 1, 2, 3...). moduleCount wylicza serwer.
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => RailInputDto)
  rails?: RailInputDto[];
  // Stary sposób (bez szyn) — nadal obsługiwany dla zgodności wstecznej
  @IsOptional() @IsInt() @Min(1) moduleCount?: number;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateDistributionBoardDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  // Dla rozdzielni z szynami liczbę modułów zmienia się przez /rails
  @IsOptional() @IsInt() @Min(1) moduleCount?: number;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() description?: string;
}

export class SetBoardRailsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => RailInputDto)
  rails: RailInputDto[];
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
  // Który wyłącznik różnicowoprądowy (RCD, id innego aparatu w tej samej
  // rozdzielni) chroni ten obwód — do etykiety zbiorczej "Obwody: 1,3,5"
  @IsOptional() @IsString() protectedByRcdId?: string;
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
