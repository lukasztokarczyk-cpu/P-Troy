import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Weryfikuje access token JWT (strategia "jwt" zarejestrowana w AuthModule).
// Krótki czas życia access tokena + osobny RefreshToken (patrz AuthService)
// ograniczają skutki ewentualnego wycieku tokena.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException('Sesja wygasła — zaloguj się ponownie');
    }
    return user;
  }
}
