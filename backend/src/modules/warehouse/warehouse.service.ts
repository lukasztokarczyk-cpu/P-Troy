import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateWarehouseDto,
  CreateProductDto,
  UpdateProductDto,
  SetStockLevelDto,
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
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  // ---- Produkty ----

  findProducts(filter: { category?: string; warehouseId?: string; search?: string }) {
    return this.prisma.product.findMany({
      where: {
        category: filter.category as any,
        ...(filter.search && {
          OR: [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { code: { contains: filter.search, mode: 'insensitive' } },
            { catalogNumber: { contains: filter.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        stockLevels: {
          where: filter.warehouseId ? { warehouseId: filter.warehouseId } : undefined,
          include: { warehouse: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findProduct(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        stockLevels: { include: { warehouse: true } },
        history: { orderBy: { createdAt: 'desc' }, take: 50 },
        inventoryCodes: true,
      },
    });
  }

  async createProduct(dto: CreateProductDto) {
    const product = await this.prisma.product.create({ data: dto });
    await this.prisma.productHistory.create({
      data: { productId: product.id, action: 'CREATED', details: dto as any },
    });
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
    const level = await this.prisma.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId: dto.warehouseId } },
      update: { quantity: dto.quantity, minQuantity: dto.minQuantity },
      create: {
        productId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        minQuantity: dto.minQuantity,
      },
    });

    await this.prisma.productHistory.create({
      data: {
        productId,
        action: 'STOCK_ADJUSTED',
        details: { warehouseId: dto.warehouseId, quantity: dto.quantity },
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
