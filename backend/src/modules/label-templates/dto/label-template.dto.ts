import { IsString, IsOptional, IsBoolean, IsEnum, IsNumber, Min, IsArray, ValidateNested, MinLength, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { LabelTargetType } from '@prisma/client';

export class LabelFieldLayoutItemDto {
  // Klucz pola z LabelDataProvider.getAvailableFields() (pomijane dla
  // szablonów ostrzegawczych — tam treść wpisywana jest ręcznie przy druku)
  @IsOptional() @IsString() field?: string;
  @IsOptional() @IsBoolean() bold?: boolean;
}

export class CreateLabelTemplateDto {
  @IsString() @MinLength(1) name: string;
  @IsEnum(LabelTargetType) targetType: LabelTargetType;
  @IsOptional() @IsNumber() @Min(10) widthMm?: number;
  @IsOptional() @IsNumber() @Min(10) heightMm?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LabelFieldLayoutItemDto)
  fieldsLayout: LabelFieldLayoutItemDto[];
  @IsOptional() @IsBoolean() includeQr?: boolean;
  @IsOptional() @IsBoolean() isWarning?: boolean;
}

export class UpdateLabelTemplateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsNumber() @Min(10) widthMm?: number;
  @IsOptional() @IsNumber() @Min(10) heightMm?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LabelFieldLayoutItemDto)
  fieldsLayout?: LabelFieldLayoutItemDto[];
  @IsOptional() @IsBoolean() includeQr?: boolean;
}

export class CreatePrintJobDto {
  @IsString() @IsNotEmpty() templateId: string;
  @IsEnum(LabelTargetType) targetType: LabelTargetType;
  @IsArray() @IsString({ each: true }) recordIds: string[];
  @IsOptional() @IsNumber() @Min(1) copies?: number;
  @IsOptional() @IsEnum(['browser', 'print-agent'] as any) method?: 'browser' | 'print-agent';
  // Dla szablonów ostrzegawczych (isWarning) — treść wpisana ręcznie,
  // zastosowana identycznie do każdej zaznaczonej etykiety w tym zleceniu
  @IsOptional() @IsString() customText?: string;
  // "wydruk tylko elementów bez wcześniejszego wydruku" — jeśli true,
  // rekordy z co najmniej jednym wcześniejszym PrintJobItem.printedAt
  // są pomijane
  @IsOptional() @IsBoolean() onlyUnprinted?: boolean;
}
