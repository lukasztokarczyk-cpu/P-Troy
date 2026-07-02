import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;
const REFRESH_TOKEN_TTL_DAYS_REMEMBER = 30;
const BCRYPT_ROUNDS = 12;

/**
 * Strategia: krótko żyjący access token (JWT, 15 min) + długo żyjący
 * refresh token (losowy sekret, przechowywany w bazie WYŁĄCZNIE jako
 * hash SHA-256 — nawet wyciek bazy nie ujawnia ważnych tokenów).
 * "Zapamiętaj mnie" wydłuża TTL refresh tokena z 7 do 30 dni.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly auditLog: AuditLogService,
  ) {}

  async login(login: string, password: string, rememberMe: boolean, ip: string, userAgent: string) {
    const user = await this.prisma.user.findUnique({ where: { login } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Nieprawidłowy login lub hasło');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Nieprawidłowy login lub hasło');
    }

    const tokens = await this.issueTokenPair(user.id, user.role, rememberMe, ip);

    await this.auditLog.record({
      userId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        login: user.login,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async refresh(refreshToken: string, ip: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesja wygasła — zaloguj się ponownie');
    }

    // Rotacja: stary refresh token jest unieważniany, wydawany jest nowy —
    // ogranicza to okno użycia w razie wycieku tokena
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(stored.userId, stored.user.role, false, ip);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Celowo nie ujawniamy, czy e-mail istnieje w systemie (ochrona przed enumeracją)
    if (!user) return;

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.mail.send({
      to: email,
      subject: 'Reset hasła — ERP Elektryk',
      template: 'password-reset',
      context: { resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}` },
    });
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = this.hashToken(rawToken);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Link do resetu hasła jest nieprawidłowy lub wygasł');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      // Unieważnij wszystkie aktywne sesje po zmianie hasła
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Aktualne hasło jest nieprawidłowe');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  // -----------------------------------------------------------------

  private async issueTokenPair(userId: string, role: string, rememberMe: boolean, ip: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TOKEN_TTL },
    );

    const rawRefreshToken = randomBytes(40).toString('hex');
    const ttlDays = rememberMe ? REFRESH_TOKEN_TTL_DAYS_REMEMBER : REFRESH_TOKEN_TTL_DAYS;

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        createdByIp: ip,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
