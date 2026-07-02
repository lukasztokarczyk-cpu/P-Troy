import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
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
}

export class RecordMaterialUsageDto {
  @IsString() siteId: string;
  @IsString() productId: string;
  @IsString() warehouseId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsString() taskId?: string;
}
