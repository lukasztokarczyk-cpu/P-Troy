import { IsEnum, IsNumber, Min, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ExpenseType } from '@prisma/client';

export class CreateExpenseNoteDto {
  @IsEnum(ExpenseType)
  type: ExpenseType;

  @IsNumber()
  @Min(0.01, { message: 'Kwota musi być większa od zera' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  // Wymagane wyłącznie dla tankowania — do którego pojazdu się odnosi
  @ValidateIf((dto) => dto.type === 'REFUELING')
  @IsString({ message: 'Dla tankowania trzeba wskazać pojazd' })
  vehicleId?: string;

  // Zdjęcie paragonu/faktury — OBOWIĄZKOWE, jako base64 PNG/JPG z <input type="file">
  @IsString({ message: 'Zdjęcie paragonu lub faktury jest obowiązkowe' })
  receiptBase64: string;
}
