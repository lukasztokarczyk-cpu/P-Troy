import { Injectable, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { CreateUserDto, UpdateUserDto, CreateCustomRoleDto } from './dto/user.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async findMany() {
    return this.prisma.user.findMany({
      select: {
        id: true, login: true, email: true, firstName: true, lastName: true,
        phone: true, avatarUrl: true, role: true, customRoleId: true, isActive: true, createdAt: true, color: true,
      },
      orderBy: { lastName: 'asc' },
    });
  }

  // Lekka lista instalatorów — używana przy przypisywaniu do wydarzeń
  // w Harmonogramie (dostępna też dla Kierownika, nie tylko Admina)
  async findInstallers() {
    return this.prisma.user.findMany({
      where: { role: 'INSTALATOR', isActive: true },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, color: true },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, login: true, email: true, firstName: true, lastName: true,
        phone: true, avatarUrl: true, role: true, customRoleId: true, isActive: true, createdAt: true, color: true,
      },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ login: dto.login }, { email: dto.email }] },
    });
    if (existing) throw new ConflictException('Login lub e-mail jest już zajęty');

    // "Podczas dodawania użytkownika obowiązkowo wybiera kolor
    // instalatora. Kolory instalatorów nie mogą się powtarzać."
    if (dto.role === 'INSTALATOR') {
      if (!dto.color) {
        throw new BadRequestException('Kolor instalatora jest obowiązkowy dla tej roli');
      }
      const colorTaken = await this.prisma.user.findUnique({ where: { color: dto.color } });
      if (colorTaken) {
        throw new ConflictException('Ten kolor jest już przypisany do innego instalatora — wybierz inny');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        login: dto.login,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        customRoleId: dto.customRoleId,
        color: dto.role === 'INSTALATOR' ? dto.color : undefined,
      },
    });

    await this.mail.send({
      to: dto.email,
      subject: 'Witamy w systemie ERP',
      template: 'welcome',
      context: { login: dto.login },
    }).catch(() => undefined); // brak SMTP nie blokuje utworzenia konta

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  async deactivate(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new ForbiddenException('Nie możesz dezaktywować własnego konta');
    }
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  // ---- Role niestandardowe: "Możliwość dodawania kolejnych ról" ----

  async findCustomRoles() {
    return this.prisma.customRole.findMany({ include: { permissions: true } });
  }

  async createCustomRole(dto: CreateCustomRoleDto) {
    return this.prisma.customRole.create({ data: dto });
  }

  async setRolePermissions(
    roleOrCustomRoleId: string,
    isCustom: boolean,
    grants: { moduleId: string; action: string }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (isCustom) {
        await tx.permissionGrant.deleteMany({ where: { customRoleId: roleOrCustomRoleId } });
      } else {
        await tx.permissionGrant.deleteMany({ where: { role: roleOrCustomRoleId as any } });
      }
      await tx.permissionGrant.createMany({
        data: grants.map((g) => ({
          moduleId: g.moduleId,
          action: g.action as any,
          role: isCustom ? undefined : (roleOrCustomRoleId as any),
          customRoleId: isCustom ? roleOrCustomRoleId : undefined,
        })),
      });
    });
  }
}
