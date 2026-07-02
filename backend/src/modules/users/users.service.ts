import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
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
        phone: true, avatarUrl: true, role: true, customRoleId: true, isActive: true, createdAt: true,
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, login: true, email: true, firstName: true, lastName: true,
        phone: true, avatarUrl: true, role: true, customRoleId: true, isActive: true, createdAt: true,
      },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ login: dto.login }, { email: dto.email }] },
    });
    if (existing) throw new ConflictException('Login lub e-mail jest już zajęty');

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
