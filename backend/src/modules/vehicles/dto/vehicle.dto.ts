import { IsString, IsOptional, IsEnum, IsInt, IsNumber, IsDateString, Min } from 'class-validator';
import { VehicleType, EquipmentCategory } from '@prisma/client';

export class CreateVehicleDto {
  @IsEnum(VehicleType) type: VehicleType;
  @IsString() brand: string;
  @IsString() model: string;
  @IsString() registrationNumber: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsDateString() inspectionDueDate?: string;
  @IsOptional() @IsDateString() insuranceDueDate?: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsDateString() inspectionDueDate?: string;
  @IsOptional() @IsDateString() insuranceDueDate?: string;
}

export class AssignVehicleDto {
  @IsString() userId: string;
}

export class AddEquipmentDto {
  @IsString() name: string;
  @IsEnum(EquipmentCategory) category: EquipmentCategory;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() assignedInstallerId?: string;
}

export class AssignEquipmentDto {
  @IsOptional() @IsString() installerId?: string; // pusty = odpięcie od instalatora
}

export class SetVehicleMaterialDto {
  @IsString() productId: string;
  @IsNumber() @Min(0) quantity: number;
}

export class TransferEquipmentDto {
  @IsString() toUserId: string;
  @IsString() reason: string;
}
