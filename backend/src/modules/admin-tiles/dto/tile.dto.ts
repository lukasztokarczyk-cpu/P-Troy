import { IsString, IsOptional, IsBoolean, IsArray, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateTileDto {
  @IsString() key: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsString() icon: string;
  @IsString() route: string;
  @IsOptional() @IsString() color?: string;
}

export class UpdateTileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() route?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
}

export class ReorderTilesDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds: string[];
}

export class SetTilePermissionsDto {
  @IsArray()
  grants: { role?: Role; customRoleId?: string; action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'MANAGE' }[];
}
