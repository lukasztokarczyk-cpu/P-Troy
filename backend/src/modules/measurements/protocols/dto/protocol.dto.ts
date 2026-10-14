import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const OBJECT_TYPES = ['HOUSE', 'PUBLIC', 'OTHER'] as const;
export const INSPECTION_KINDS = [
  'PERIODIC',
  'ACCEPTANCE',
  'AFTER_MODERNIZATION',
  'AFTER_RENOVATION',
  'AFTER_FIXES',
  'OTHER',
] as const;
// COMPLETED ustawia wyłącznie zatwierdzenie protokołu.
export const EDITABLE_STATUSES = ['DRAFT', 'TODO', 'IN_PROGRESS', 'NEEDS_FIXES'] as const;
export const FIELD_TYPES = ['text', 'number', 'date', 'checkbox', 'list', 'table', 'photo', 'attachment'] as const;

export class CreateProtocolDto {
  @IsIn(OBJECT_TYPES as unknown as string[]) objectType: string;
  @IsOptional() @IsString() @MaxLength(200) objectTypeName?: string;

  // Budowa z P-Troy ALBO budowa zewnętrzna (dane zapisane razem z protokołem)
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsObject() externalSite?: Record<string, any>;
  @IsOptional() @IsBoolean() addExternalToSites?: boolean;

  @IsIn(INSPECTION_KINDS as unknown as string[]) inspectionKind: string;
  @IsOptional() @IsString() @MaxLength(200) inspectionKindName?: string;

  @IsOptional() @IsDateString() performedAt?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() finishedAt?: string;
  @IsOptional() @IsDateString() nextInspectionDate?: string;

  // Osoba wykonująca: użytkownik P-Troy ALBO osoba zewnętrzna
  @IsOptional() @IsString() performerUserId?: string;
  @IsOptional() @IsObject() performerExternal?: Record<string, any>;

  // „Utwórz na podstawie poprzedniego” — kopiuje strukturę, bez wyników
  @IsOptional() @IsString() previousProtocolId?: string;
}

export class UpdateProtocolDto {
  @IsOptional() @IsIn(OBJECT_TYPES as unknown as string[]) objectType?: string;
  @IsOptional() @IsString() @MaxLength(200) objectTypeName?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsObject() externalSite?: Record<string, any>;
  @IsOptional() @IsIn(INSPECTION_KINDS as unknown as string[]) inspectionKind?: string;
  @IsOptional() @IsString() @MaxLength(200) inspectionKindName?: string;
  @IsOptional() @IsDateString() performedAt?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() finishedAt?: string;
  @IsOptional() @IsDateString() nextInspectionDate?: string;
  @IsOptional() @IsIn(EDITABLE_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() performerUserId?: string;
  @IsOptional() @IsObject() performerExternal?: Record<string, any>;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  // Cała treść protokołu (autosave). Zapis wersji roboczej nigdy nie jest blokowany walidacją.
  @IsOptional() @IsObject() data?: Record<string, any>;
  // updatedAt, który klient widział ostatnio — chroni przed nadpisaniem zmian z drugiego urządzenia
  @IsOptional() @IsDateString() baseUpdatedAt?: string;
  // true → autosave (ustawia lastAutosaveAt)
  @IsOptional() @IsBoolean() autosave?: boolean;
}

export class SignProtocolDto {
  @IsIn(['PERFORMER', 'REPRESENTATIVE']) role: string;
  @IsString() @MaxLength(200) signerName: string;
  @IsOptional() @IsString() @MaxLength(300) qualifications?: string;
  @IsString() signatureImageBase64: string;
  @IsOptional() @IsIn(['MOUSE', 'TOUCH', 'STYLUS']) inputMethod?: string;
}

export class UploadAttachmentDto {
  @IsString() @MaxLength(255) fileName: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsString() base64: string;
  // np. "instruments:<rowId>", "defects:<rowId>:before", "defects:<rowId>:after"
  @IsOptional() @IsString() @MaxLength(200) fieldKey?: string;
}

export class PrintProtocolDto {
  @IsIn(['FULL', 'MEASUREMENTS', 'BLANK']) mode: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sections?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(500) blankRows?: number;
  @IsOptional() @IsIn(['PRINT', 'DOWNLOAD']) action?: string;
}

export class ImportBoardDto {
  @IsString() boardId: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sections?: string[];
}

export class CloseDeadlineDto {
  @IsBoolean() closed: boolean;
}

export class CalcConfigDto {
  @IsOptional() @IsNumber() u0?: number | null;
  @IsOptional() @IsObject() coefficients?: Record<string, number | null>;
  @IsOptional() @IsString() @MaxLength(500) basis?: string | null;
}

export class SectionDefinitionDto {
  @IsString() @MaxLength(120) title: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) objectTypes?: string[];
  // Kolumny tabeli: [{ key?, label, type, unit? }]; brak = sekcja z polami
  @IsOptional() @IsArray() columns?: Record<string, any>[];
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSectionDefinitionDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) objectTypes?: string[];
  @IsOptional() @IsArray() columns?: Record<string, any>[];
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class FieldDefinitionDto {
  @IsString() sectionKey: string;
  @IsString() @MaxLength(120) label: string;
  @IsIn(FIELD_TYPES as unknown as string[]) type: string;
  @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(500) hint?: string;
  // list: ["opcja 1", ...]; table: [{ key?, label, type, unit? }]
  @IsOptional() @IsArray() options?: any[];
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateFieldDefinitionDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(500) hint?: string;
  @IsOptional() @IsArray() options?: any[];
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
