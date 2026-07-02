import { IsString, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
import { CodeSymbology, CodeTargetType, CodeScanOperation } from '@prisma/client';

export class GenerateCodeDto {
  @IsEnum(CodeSymbology)
  symbology: CodeSymbology;

  @IsEnum(CodeTargetType)
  targetType: CodeTargetType;

  @IsString()
  targetId: string; // productId / toolId / vehicleId w zależności od targetType
}

// Wywoływane po zeskanowaniu kodu aparatem telefonu — jeden endpoint
// obsługuje wszystkie typy operacji, więc skaner może pozostać otwarty
// i przetwarzać kolejne odczyty bez przełączania ekranów
export class ScanCodeDto {
  @IsString()
  value: string; // surowa wartość odczytana ze skanera

  @IsEnum(CodeScanOperation)
  operation: CodeScanOperation;

  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsString() sourceWarehouseId?: string;
  @IsOptional() @IsString() targetWarehouseId?: string;
  @IsOptional() @IsString() assignedVehicleId?: string;
  @IsOptional() @IsString() assignedSiteId?: string;
  @IsOptional() @IsString() assignedUserId?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}
