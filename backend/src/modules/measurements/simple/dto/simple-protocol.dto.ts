import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SimpleItemDto {
  @IsString() @MaxLength(200) name: string;
  // liczba albo tekst z przecinkiem („2,5”) albo puste — walidacja w logice (puste pozycje są pomijane)
  @IsOptional() quantity?: number | string | null;
  @IsOptional() @IsBoolean() custom?: boolean;
}

export class CreateSimpleProtocolDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsObject() externalSite?: Record<string, any>;
  @IsOptional() @IsDateString() performedAt?: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SimpleItemDto) items?: SimpleItemDto[];
  @IsOptional() @IsString() @MaxLength(80) clientToken?: string;
}

export class UpdateSimpleProtocolDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsObject() externalSite?: Record<string, any>;
  @IsOptional() @IsDateString() performedAt?: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SimpleItemDto) items?: SimpleItemDto[];
}

export class UploadSimplePhotoDto {
  @IsString() @MaxLength(255) fileName: string;
  @IsString() base64: string;
}

export class SimpleListQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
