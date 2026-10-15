import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ORDER_STATUSES } from '../orders-logic';

export class OrderItemDto {
  // Id istniejącej pozycji (przy edycji) — pozwala zachować jej zdjęcia
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() catalogItemId?: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(300) spec?: string;
  @IsNumber() @Min(0.001) @Max(1_000_000) quantity: number;
  @IsString() @MinLength(1) @MaxLength(20) unit: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsBoolean() isCustom?: boolean;
}

export class CreateOrderDto {
  @IsString() siteId: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  // Klucz idempotencji z aplikacji — ponowienie tego samego żądania nie tworzy drugiego zamówienia
  @IsOptional() @IsString() @MaxLength(100) clientToken?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items?: OrderItemDto[];
}

export class UpdateOrderDto {
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items?: OrderItemDto[];
}

export class ChangeStatusDto {
  @IsIn(ORDER_STATUSES as unknown as string[]) status: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class CommentDto {
  @IsString() @MinLength(1) @MaxLength(2000) message: string;
}

export class UploadOrderPhotoDto {
  @IsString() @MaxLength(255) fileName: string;
  @IsString() base64: string;
  // null/brak = zdjęcie do całego zamówienia
  @IsOptional() @IsString() itemId?: string;
}

export class PrintOrderDto {
  // Zdjęcia dołączamy tylko na życzenie (jako osobna sekcja na końcu dokumentu)
  @IsOptional() @IsBoolean() includePhotos?: boolean;
}

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateCatalogItemDto {
  @IsString() categoryId: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(20) defaultUnit?: string;
  @IsOptional() @IsString() @MaxLength(200) specHint?: string;
}

export class UpdateCatalogItemDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(20) defaultUnit?: string;
  @IsOptional() @IsString() @MaxLength(200) specHint?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class ListOrdersQuery {
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() createdById?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() q?: string;
}
