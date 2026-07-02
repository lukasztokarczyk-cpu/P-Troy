import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTileDto, UpdateTileDto, ReorderTilesDto, SetTilePermissionsDto } from './dto/tile.dto';
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
export class AdminTilesService {
  constructor(private readonly prisma: PrismaService) {}

  async findVisibleForUser(userId: string, role: Role, customRoleId?: string | null) {
    const tiles = await this.prisma.dashboardModule.findMany({
      where: { isEnabled: true },
      orderBy: { order: 'asc' },
      include: { permissions: true },
    });

    const visible = tiles.filter((tile) => {
      if (tile.permissions.length === 0) return true; // brak konfiguracji = widoczny domyślnie
      return tile.permissions.some(
        (p) => p.action === 'VIEW' && (p.role === role || (customRoleId && p.customRoleId === customRoleId)),
      );
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
      await tx.permissionGrant.deleteMany({ where: { moduleId } });
      await tx.permissionGrant.createMany({
        data: dto.grants.map((g) => ({ moduleId, role: g.role, customRoleId: g.customRoleId, action: g.action })),
      });
    });
  }
}
