import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, IsArray, MinLength } from 'class-validator';
import { SiteStatus, SitePriority, InvestorAgreementStatus } from '@prisma/client';

export class CreateSiteDto {
  @IsString() @MinLength(3) name: string;
  @IsString() investor: string;
  @IsString() address: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsEnum(SitePriority) priority?: SitePriority;
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
}

export class UpdateSiteDto {
  @IsOptional() @IsString() @MinLength(3) name?: string;
  @IsOptional() @IsString() investor?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsEnum(SiteStatus) status?: SiteStatus;
  @IsOptional() @IsEnum(SitePriority) priority?: SitePriority;
  @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
}

export class AddSiteNoteDto {
  @IsString() @MinLength(1) content: string;
}

export class CreateChecklistDto {
  @IsString() title: string;
  @IsArray() @IsString({ each: true }) items: string[];
}

export class CreateInvestorAgreementDto {
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() attachmentBase64?: string;
}

export class UpdateInvestorAgreementStatusDto {
  @IsEnum(InvestorAgreementStatus) status: InvestorAgreementStatus;
  @IsOptional() @IsString() decisionNote?: string;
}