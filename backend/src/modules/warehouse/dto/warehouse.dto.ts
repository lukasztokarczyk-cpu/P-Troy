import { IsString, IsOptional, MaxLength, MinLength, IsEnum, IsNumber, Min } from 'class-validator';
import { ProductCategory } from '@prisma/client';

export class CreateWarehouseDto {
  @IsString() name: string;
  @IsOptional() @IsString() address?: string;
}

export class CreateProductDto {
  @IsString() name: string;
  @IsString() code: string;
  @IsOptional() @IsString() catalogNumber?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsEnum(ProductCategory) category: ProductCategory;
  @IsString() unit: string;
  @IsOptional() @IsString() locationLabel?: string;
  // Magazyn, do którego trafia produkt + stan początkowy (zapis w jednej transakcji)
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) minQuantity?: number;
  // Półka (w wybranym magazynie), na której leży produkt
  @IsOptional() @IsString() shelfId?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() catalogNumber?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsEnum(ProductCategory) category?: ProductCategory;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() locationLabel?: string;
}

export class SetStockLevelDto {
  @IsString() warehouseId: string;
  @IsNumber() @Min(0) quantity: number;
  @IsOptional() @IsNumber() @Min(0) minQuantity?: number;
  // null = zdejmij z półki; pominięte = bez zmiany lokalizacji
  @IsOptional() @IsString() shelfId?: string | null;
}

export class SetProductLocationDto {
  @IsString() warehouseId: string;
  // null = produkt bez regału/półki
  @IsOptional() @IsString() shelfId?: string | null;
}

export class CreateRackDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
}

export class CreateShelfDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
}

export class RecordMaterialUsageDto {
  @IsString() siteId: string;
  @IsString() productId: string;
  @IsString() warehouseId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsString() taskId?: string;
}
