import { IsString, IsEnum, IsOptional, MinLength, Matches } from 'class-validator';
import { SignerRole, SignatureInputMethod } from '@prisma/client';

export class SignDocumentDto {
  @IsEnum(SignerRole)
  signerRole: SignerRole;

  @IsOptional()
  @IsString()
  signerId?: string; // wypełniane, gdy podpisujący ma konto w systemie

  @IsString()
  @MinLength(3)
  signerName: string;

  @IsEnum(SignatureInputMethod)
  inputMethod: SignatureInputMethod;

  // data:image/png;base64,....
  @Matches(/^data:image\/png;base64,/, {
    message: 'Podpis musi być obrazem PNG zakodowanym w base64',
  })
  signatureImageBase64: string;
}
