import { Injectable, BadRequestException, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateTileDto,
  UpdateTileDto,
  ReorderTilesDto,
  SetTilePermissionsDto,
  SetUserModulePermissionsDto,
} from './dto/tile.dto';
import { Role } from '@prisma/client';

/**
 * Zarządzanie kafelkami dashboardu — realizuje wymagania sekcji
 * "Administrator": tworzenie/edycja/usuwanie kafelków, nadawanie
 * uprawnień, zmiana kolejności metodą Drag & Drop. Każdy kafelek
 * odpowiada modułowi (DashboardModule) — dodanie nowego modułu do
 * systemu to nowy wpis tutaj + zarejestrowanie jego NestJS Module
 * w AppModule, bez zmian w istniejących modułach.
 */
@Injectable()
export class AdminTilesService implements OnModuleInit {
  private readonly logger = new Logger(AdminTilesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Samoleczenie: dopisuje brakujący kafelek "failures" (nie było go w seedzie).
   * ZAWSZE w try/catch — niezłapany wyjątek w onModuleInit wywala całą aplikację.
   */
  async onModuleInit() {
    try {
      const existing = await this.prisma.dashboardModule.findFirst({
        where: { OR: [{ key: 'failures' }, { route: '/failures' }] },
      });
      if (existing) return;
      const maxOrder = await this.prisma.dashboardModule.aggregate({ _max: { order: true } });
      await this.prisma.dashboardModule.create({
        data: {
          key: 'failures',
          name: 'Awarie',
          icon: 'AlertTriangle',
          route: '/failures',
          color: '#f97316',
          order: (maxOrder._max.order ?? 0) + 1,
          isSystem: true,
        },
      });
      this.logger.log('Dodano brakujący kafelek "failures"');
    } catch (err) {
      this.logger.warn(`Nie udało się dopisać kafelka "failures": ${(err as Error).message}`);
    }
  }

  /**
   * Wspólna zasada dostępu (używana przez listę kafelków i ModuleAccessGuard):
   *  1. ADMIN — zawsze tak.
   *  2. Użytkownik z choć jednym bezpośrednim wpisem (userId) — ścisła biała
   *     lista tylko z jego wpisów VIEW.
   *  3. Pozostali — dotychczasowa logika rola/customRole (brak konfiguracji
   *     kafelka = widoczny dla wszystkich). Wpisy innych użytkowników (userId)
   *     NIE wliczają się do konfiguracji roli.
   */
  async hasModuleAccess(
    userId: string,
    role: Role,
    customRoleId: string | null | undefined,
    moduleKey: string,
  ): Promise<boolean> {
    if (role === 'ADMIN') return true;

    const tile = await this.prisma.dashboardModule.findUnique({
      where: { key: moduleKey },
      include: { permissions: true },
    });

    const directCount = await this.prisma.permissionGrant.count({ where: { userId } });
    if (directCount > 0) {
      if (!tile) return false;
      return tile.permissions.some((p) => p.userId === userId && p.action === 'VIEW');
    }

    if (!tile) return true; // moduł niezarejestrowany jako kafelek — bez ograniczeń
    return this.roleAllows(tile.permissions, role, customRoleId);
  }

  private roleAllows(
    permissions: { userId: string | null; role: Role | null; customRoleId: string | null; action: string }[],
    role: Role,
    customRoleId?: string | null,
  ): boolean {
    const roleGrants = permissions.filter((p) => !p.userId);
    if (roleGrants.length === 0) return true; // brak konfiguracji = widoczny domyślnie
    return roleGrants.some(
      (p) => p.action === 'VIEW' && (p.role === role || (!!customRoleId && p.customRoleId === customRoleId)),
    );
  }

  async findVisibleForUser(userId: string, role: Role, customRoleId?: string | null) {
    const tiles = await this.prisma.dashboardModule.findMany({
      where: { isEnabled: true },
      orderBy: { order: 'asc' },
      include: { permissions: true },
    });

    const directCount = role === 'ADMIN' ? 0 : await this.prisma.permissionGrant.count({ where: { userId } });

    const visible = tiles.filter((tile) => {
      if (role === 'ADMIN') return true;
      if (directCount > 0) {
        return tile.permissions.some((p) => p.userId === userId && p.action === 'VIEW');
      }
      return this.roleAllows(tile.permissions, role, customRoleId);
    });

    const unreadCounts = await this.prisma.notification.groupBy({
      by: ['entityType'],
      where: { userId, isRead: false },
      _count: true,
    });

    return visible.map((tile) => ({
      ...tile,
      notificationCount:
        unreadCounts.find((c) => c.entityType?.toLowerCase() === tile.key.toLowerCase())?._count ?? 0,
    }));
  }

  findAll() {
    return this.prisma.dashboardModule.findMany({ orderBy: { order: 'asc' }, include: { permissions: true } });
  }

  async create(dto: CreateTileDto) {
    const maxOrder = await this.prisma.dashboardModule.aggregate({ _max: { order: true } });
    return this.prisma.dashboardModule.create({
      data: { ...dto, order: (maxOrder._max.order ?? 0) + 1 },
    });
  }

  update(id: string, dto: UpdateTileDto) {
    return this.prisma.dashboardModule.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const tile = await this.prisma.dashboardModule.findUniqueOrThrow({ where: { id } });
    if (tile.isSystem) {
      throw new BadRequestException('Kafelki systemowe można wyłączyć w edycji, ale nie można ich usunąć');
    }
    return this.prisma.dashboardModule.delete({ where: { id } });
  }

  async reorder(dto: ReorderTilesDto) {
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.dashboardModule.update({ where: { id }, data: { order: index } }),
      ),
    );
  }

  async setPermissions(moduleId: string, dto: SetTilePermissionsDto) {
    return this.prisma.$transaction(async (tx) => {
      // kasujemy tylko wpisy ról — bezpośrednie uprawnienia użytkowników zostają
      await tx.permissionGrant.deleteMany({ where: { moduleId, userId: null } });
      await tx.permissionGrant.createMany({
        data: dto.grants.map((g) => ({ moduleId, role: g.role, customRoleId: g.customRoleId, action: g.action })),
      });
    });
  }

  /**
   * Stan uprawnień konta. Gdy konto nie ma wpisów bezpośrednich, zwraca
   * efektywny zestaw wynikający z roli (hasDirectGrants=false).
   */
  async getUserPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Nie znaleziono użytkownika');

    const tiles = await this.prisma.dashboardModule.findMany({
      orderBy: { order: 'asc' },
      include: { permissions: true },
    });
    const direct = tiles.filter((t) => t.permissions.some((p) => p.userId === userId && p.action === 'VIEW'));
    const hasDirectGrants = (await this.prisma.permissionGrant.count({ where: { userId } })) > 0;

    const moduleKeys = hasDirectGrants
      ? direct.map((t) => t.key)
      : tiles
          .filter((t) => user.role === 'ADMIN' || this.roleAllows(t.permissions, user.role, user.customRoleId))
          .map((t) => t.key);

    return { userId, hasDirectGrants, moduleKeys };
  }

  /** Ustawia ścisłą białą listę modułów dla konta (zastępuje poprzednią). */
  async setUserPermissions(userId: string, dto: SetUserModulePermissionsDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Nie znaleziono użytkownika');

    const keys = Array.from(new Set(dto.moduleKeys));
    if (keys.length === 0) {
      // pusta lista skasowałaby wpisy i konto wróciłoby do uprawnień roli (zwykle: wszystko)
      throw new BadRequestException('Wybierz co najmniej jeden moduł');
    }

    const tiles = await this.prisma.dashboardModule.findMany({ where: { key: { in: keys } } });
    if (tiles.length !== keys.length) {
      const known = new Set(tiles.map((t) => t.key));
      throw new BadRequestException(`Nieznane moduły: ${keys.filter((k) => !known.has(k)).join(', ')}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.permissionGrant.deleteMany({ where: { userId } });
      await tx.permissionGrant.createMany({
        data: tiles.map((t) => ({ moduleId: t.id, userId, action: 'VIEW' as const })),
      });
    });

    return this.getUserPermissions(userId);
  }
}
