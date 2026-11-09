import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateWarehouseDto,
  CreateProductDto,
  UpdateProductDto,
  SetStockLevelDto,
  SetProductLocationDto,
  RecordMaterialUsageDto,
} from './dto/warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Magazyny (można tworzyć wiele) ----

  findWarehouses() {
    return this.prisma.warehouse.findMany({
      orderBy: { name: 'asc' },
      include: { racks: { include: { shelves: true } } },
    });
  }

  // ---- Regały i półki (zarządza tylko ADMIN — patrz kontroler) ----

  private cleanName(name: string) {
    const n = (name ?? '').trim().replace(/\s+/g, ' ');
    if (!n) throw new BadRequestException('Podaj nazwę');
    return n;
  }

  async createRack(warehouseId: string, name: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new NotFoundException('Magazyn nie istnieje');
    const clean = this.cleanName(name);
    const dup = await this.prisma.warehouseRack.findFirst({ where: { warehouseId, name: { equals: clean, mode: 'insensitive' } } });
    if (dup) throw new ConflictException('Regał o takiej nazwie już jest w tym magazynie');
    return this.prisma.warehouseRack.create({ data: { warehouseId, name: clean }, include: { shelves: true } });
  }

  async removeRack(rackId: string) {
    const rack = await this.prisma.warehouseRack.findUnique({ where: { id: rackId } });
    if (!rack) throw new NotFoundException('Regał nie istnieje');
    // półki znikają razem z regałem, a produkty zostają w magazynie (tylko bez lokalizacji)
    await this.prisma.warehouseRack.delete({ where: { id: rackId } });
    return { ok: true };
  }

  async createShelf(rackId: string, name: string) {
    const rack = await this.prisma.warehouseRack.findUnique({ where: { id: rackId } });
    if (!rack) throw new NotFoundException('Regał nie istnieje');
    const clean = this.cleanName(name);
    const dup = await this.prisma.warehouseShelf.findFirst({ where: { rackId, name: { equals: clean, mode: 'insensitive' } } });
    if (dup) throw new ConflictException('Półka o takiej nazwie już jest na tym regale');
    return this.prisma.warehouseShelf.create({ data: { rackId, name: clean } });
  }

  async removeShelf(shelfId: string) {
    const shelf = await this.prisma.warehouseShelf.findUnique({ where: { id: shelfId } });
    if (!shelf) throw new NotFoundException('Półka nie istnieje');
    await this.prisma.warehouseShelf.delete({ where: { id: shelfId } });
    return { ok: true };
  }

  /** Półka musi należeć do wskazanego magazynu (inaczej 400). */
  private async assertShelfInWarehouse(shelfId: string, warehouseId: string) {
    const shelf = await this.prisma.warehouseShelf.findUnique({ where: { id: shelfId }, include: { rack: true } });
    if (!shelf || shelf.rack.warehouseId !== warehouseId) {
      throw new BadRequestException('Wybrana półka nie należy do tego magazynu');
    }
  }

  /** Zmiana regału/półki istniejącego produktu w magazynie (bez ruszania stanu). */
  async setProductLocation(productId: string, dto: SetProductLocationDto) {
    const level = await this.prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: dto.warehouseId } },
    });
    if (!level) throw new BadRequestException('Produkt nie jest przypisany do tego magazynu');
    if (dto.shelfId) await this.assertShelfInWarehouse(dto.shelfId, dto.warehouseId);
    const updated = await this.prisma.stockLevel.update({
      where: { productId_warehouseId: { productId, warehouseId: dto.warehouseId } },
      data: { shelfId: dto.shelfId ?? null },
    });
    await this.prisma.productHistory.create({
      data: { productId, action: 'UPDATED', details: { warehouseId: dto.warehouseId, shelfId: dto.shelfId ?? null } as any },
    });
    return updated;
  }

  createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  // ---- Produkty ----

  findProducts(filter: { category?: string; warehouseId?: string; search?: string }) {
    return this.prisma.product.findMany({
      where: {
        category: filter.category as any,
        // przy wybranym magazynie zwracamy tylko produkty, które w nim są
        ...(filter.warehouseId && { stockLevels: { some: { warehouseId: filter.warehouseId } } }),
        ...(filter.search && {
          OR: [
            { name: { contains: filter.search } },
            { code: { contains: filter.search } },
            { catalogNumber: { contains: filter.search } },
          ],
        }),
      },
      include: {
        stockLevels: {
          where: filter.warehouseId ? { warehouseId: filter.warehouseId } : undefined,
          include: { warehouse: true, shelf: { include: { rack: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findProduct(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        stockLevels: { include: { warehouse: true, shelf: { include: { rack: true } } } },
        history: { orderBy: { createdAt: 'desc' }, take: 50 },
        inventoryCodes: true,
      },
    });
  }

  async createProduct(dto: CreateProductDto) {
    const { warehouseId, quantity, minQuantity, shelfId, ...data } = dto;

    if (warehouseId) {
      const wh = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!wh) throw new BadRequestException('Wybrany magazyn nie istnieje');
      if (shelfId) await this.assertShelfInWarehouse(shelfId, warehouseId);
    } else if (shelfId) {
      throw new BadRequestException('Półkę można wybrać tylko razem z magazynem');
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data });
      if (warehouseId) {
        await tx.stockLevel.create({
          data: { productId: created.id, warehouseId, quantity: quantity ?? 0, minQuantity, shelfId },
        });
      }
      await tx.productHistory.create({
        data: { productId: created.id, action: 'CREATED', details: dto as any },
      });
      return created;
    });

    if (warehouseId && minQuantity != null && (quantity ?? 0) <= minQuantity) {
      await this.notifications
        .notifyRoles(['ADMIN', 'MAGAZYNIER'], {
          type: 'MATERIAL_LOW_STOCK',
          title: 'Niski stan magazynowy',
          message: `Stan produktu ${product.name} jest poniżej progu alarmowego`,
          entityType: 'Product',
          entityId: product.id,
        })
        .catch(() => undefined);
    }
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.update({ where: { id }, data: dto });
    await this.prisma.productHistory.create({
      data: { productId: id, action: 'UPDATED', details: dto as any },
    });
    return product;
  }

  async removeProduct(id: string) {
    return this.prisma.product.delete({ where: { id } });
  }

  /**
   * Ustawienie stanu magazynowego wprost (korekta administratora) —
   * różni się od StockMovement generowanego przez operacje skanera:
   * to jest bezpośrednie nadpisanie z zapisem w ProductHistory.
   */
  async setStockLevel(productId: string, dto: SetStockLevelDto) {
    if (dto.shelfId) await this.assertShelfInWarehouse(dto.shelfId, dto.warehouseId);
    const shelfPatch = dto.shelfId === undefined ? {} : { shelfId: dto.shelfId };
    const level = await this.prisma.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId: dto.warehouseId } },
      update: { quantity: dto.quantity, minQuantity: dto.minQuantity, ...shelfPatch },
      create: {
        productId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        minQuantity: dto.minQuantity,
        shelfId: dto.shelfId ?? undefined,
      },
    });

    await this.prisma.productHistory.create({
      data: {
        productId,
        action: 'STOCK_ADJUSTED',
        details: { warehouseId: dto.warehouseId, quantity: dto.quantity } as any,
      },
    });

    if (dto.minQuantity != null && dto.quantity <= dto.minQuantity) {
      await this.notifications.notifyRoles(['ADMIN', 'MAGAZYNIER'], {
        type: 'MATERIAL_LOW_STOCK',
        title: 'Niski stan magazynowy',
        message: `Stan produktu spadł poniżej progu alarmowego (${dto.quantity} / próg ${dto.minQuantity})`,
        entityType: 'Product',
        entityId: productId,
      });
    }

    return level;
  }

  /**
   * Ręczny wpis zużycia materiału na budowie (bez skanera) —
   * odejmuje stan magazynowy w transakcji, analogicznie do
   * InventoryCodesService.scan, żeby oba mechanizmy nigdy się nie rozjechały.
   */
  async recordMaterialUsage(dto: RecordMaterialUsageDto, takenById: string) {
    return this.prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({
        where: { productId_warehouseId: { productId: dto.productId, warehouseId: dto.warehouseId } },
      });
      if (!level || level.quantity < dto.quantity) {
        throw new BadRequestException('Niewystarczający stan magazynowy');
      }

      await tx.stockLevel.update({
        where: { productId_warehouseId: { productId: dto.productId, warehouseId: dto.warehouseId } },
        data: { quantity: { decrement: dto.quantity } },
      });

      return tx.materialUsage.create({
        data: {
          siteId: dto.siteId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          takenById,
          comment: dto.comment,
          taskId: dto.taskId,
        },
        include: { product: true },
      });
    });
  }

  // ---- Raporty ----

  async stockReport(warehouseId?: string) {
    return this.prisma.stockLevel.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      include: { product: true, warehouse: true },
      orderBy: { product: { name: 'asc' } },
    });
  }

  async lowStockReport() {
    const levels = await this.prisma.stockLevel.findMany({
      where: { minQuantity: { not: null } },
      include: { product: true, warehouse: true },
    });
    return levels.filter((l) => l.minQuantity != null && l.quantity <= l.minQuantity);
  }
}
