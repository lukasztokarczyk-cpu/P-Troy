import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateMeasurementDto {
  @IsString() siteId: string;
  @IsOptional() @IsString() description?: string;
  @IsObject() results: Record<string, unknown>;
}
