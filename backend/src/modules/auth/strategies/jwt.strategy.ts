import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Waliduje access token i doczytuje aktualny stan użytkownika z bazy
 * (nie tylko payload JWT) — dzięki temu np. dezaktywacja konta przez
 * administratora działa natychmiast, bez czekania na wygaśnięcie tokena.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: { sub: string; role: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      customRoleId: user.customRoleId,
    };
  }
}
