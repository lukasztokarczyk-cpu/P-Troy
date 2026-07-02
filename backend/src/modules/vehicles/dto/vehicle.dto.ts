import { IsString, IsOptional, IsEnum, IsInt, IsDateString, Min } from 'class-validator';
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
}

export class TransferEquipmentDto {
  @IsString() toUserId: string;
  @IsString() reason: string;
}
