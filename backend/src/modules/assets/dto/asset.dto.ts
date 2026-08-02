import { IsString, IsOptional, IsEnum, IsDateString, MinLength, IsArray } from 'class-validator';
import { AssetLocationType, AssetIssueType } from '@prisma/client';

export class CreateAssetCategoryDto {
  @IsString() @MinLength(2) name: string;
}

export class CreateAssetStatusDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() color?: string;
}

export class CreateAssetDto {
  @IsString() @MinLength(2) name: string;
  @IsString() categoryId: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  // Numer seryjny opcjonalny — brak nigdy nie blokuje zapisania sprzętu
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsDateString() warrantyEndDate?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() statusId?: string;
  // Zdjęcia — jedno lub wiele, jako base64 z frontu
  @IsOptional() @IsArray() @IsString({ each: true }) photosBase64?: string[];
}

export class UpdateAssetDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsDateString() warrantyEndDate?: string;
  @IsOptional() @IsString() description?: string;
}

// Wydanie sprzętu — administrator wybiera dokładnie jeden z wariantów
// ze specyfikacji (instalator / administrator / inny dowolny tekst)
export class AssignAssetDto {
  @IsEnum(AssetLocationType) locationType: AssetLocationType;
  @IsOptional() @IsString() holderUserId?: string;
  @IsOptional() @IsString() otherHolderText?: string;
}

// "Sprzęt wrócił" — wybór magazynu docelowego
export class ReturnAssetDto {
  @IsString() warehouseId: string;
}

export class TransferAssetDto {
  @IsString() toUserId: string;
}

export class RespondTransferDto {
  @IsOptional() @IsString() reason?: string;
}

export class SetAssetStatusDto {
  @IsString() statusId: string;
  @IsOptional() @IsString() comment?: string;
}

export class ReportAssetIssueDto {
  @IsEnum(AssetIssueType) type: AssetIssueType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() photoBase64?: string;
}
