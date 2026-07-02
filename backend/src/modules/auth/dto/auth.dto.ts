import { IsString, MinLength, IsOptional, IsBoolean, IsEmail } from 'class-validator';

export class LoginDto {
  @IsString()
  login: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean; // wydłuża czas życia refresh tokena
}

export class RequestPasswordResetDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8, { message: 'Hasło musi mieć min. 8 znaków' })
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
