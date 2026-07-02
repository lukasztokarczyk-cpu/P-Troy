import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LabelPrinterService } from '../../common/labels/label-printer.service';
import { GenerateCodeDto, ScanCodeDto } from './dto/inventory-code.dto';
import { CodeSymbology, CodeTargetType } from '@prisma/client';

@Injectable()
export class InventoryCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labelPrinter: LabelPrinterService,
  ) {}

  async generate(dto: GenerateCodeDto, createdById: string) {
    const value = this.buildCodeValue(dto.symbology, dto.targetType, dto.targetId);

    const data: any = {
      value,
      symbology: dto.symbology,
      targetType: dto.targetType,
      createdById,
    };
    if (dto.targetType === CodeTargetType.PRODUCT) data.productId = dto.targetId;
    if (dto.targetType === CodeTargetType.TOOL) data.toolId = dto.targetId;
    if (dto.targetType === CodeTargetType.VEHICLE) data.vehicleId = dto.targetId;

    return this.prisma.inventoryCode.create({ data });
  }

  async printLabel(codeId: string) {
    const code = await this.prisma.inventoryCode.findUnique({
      where: { id: codeId },
      include: { product: true, tool: true, vehicle: true },
    });
    if (!code) throw new NotFoundException('Kod nie został znaleziony');

    const label = await this.labelPrinter.render(code);
    await this.prisma.inventoryCode.update({ where: { id: codeId }, data: { printedAt: new Date() } });
    return label; // { pdfPath } lub bufor gotowy do wydruku
  }

  /**
   * Rdzeń skanera: po odczytaniu kodu zwraca pełne dane obiektu
   * (nazwa, zdjęcie, nr katalogowy, stan magazynowy, historia) —
   * front pokazuje je natychmiast, bez zamykania widoku skanera,
   * żeby umożliwić szybkie skanowanie wielu produktów pod rząd.
   */
  async lookup(value: string) {
    const code = await this.prisma.inventoryCode.findUnique({
      where: { value },
      include: {
        product: { include: { stockLevels: true } },
        tool: true,
        vehicle: true,
        scans: { orderBy: { createdAt: 'desc' }, take: 20, include: { scannedBy: true } },
      },
    });
    if (!code) throw new NotFoundException('Nieznany kod — produkt nie istnieje w systemie');
    return code;
  }

  /**
   * Wykonuje operację magazynową powiązaną z zeskanowanym kodem
   * i w jednej transakcji aktualizuje stan magazynowy (integracja
   * modułów: skan -> stan magazynu -> log operacji).
   */
  async scan(dto: ScanCodeDto, scannedById: string) {
    const code = await this.prisma.inventoryCode.findUnique({ where: { value: dto.value } });
    if (!code) throw new NotFoundException('Nieznany kod');

    return this.prisma.$transaction(async (tx) => {
      if (code.targetType === 'PRODUCT' && code.productId) {
        await this.applyStockMutation(tx, code.productId, dto);
      }

      const event = await tx.codeScanEvent.create({
        data: {
          codeId: code.id,
          operation: dto.operation,
          quantity: dto.quantity,
          sourceWarehouseId: dto.sourceWarehouseId,
          targetWarehouseId: dto.targetWarehouseId,
          assignedVehicleId: dto.assignedVehicleId,
          assignedSiteId: dto.assignedSiteId,
          assignedUserId: dto.assignedUserId,
          scannedById,
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });

      return event;
    });
  }

  // -----------------------------------------------------------------

  private async applyStockMutation(tx: any, productId: string, dto: ScanCodeDto) {
    if (!dto.quantity && dto.operation !== 'LOOKUP') {
      throw new BadRequestException('Ilość jest wymagana dla tej operacji');
    }

    switch (dto.operation) {
      case 'ISSUE':
        if (!dto.sourceWarehouseId) throw new BadRequestException('Wymagany magazyn źródłowy');
        await this.decrementStock(tx, productId, dto.sourceWarehouseId, dto.quantity!);
        break;
      case 'RETURN':
        if (!dto.targetWarehouseId) throw new BadRequestException('Wymagany magazyn docelowy');
        await this.incrementStock(tx, productId, dto.targetWarehouseId, dto.quantity!);
        break;
      case 'TRANSFER':
        if (!dto.sourceWarehouseId || !dto.targetWarehouseId) {
          throw new BadRequestException('Wymagany magazyn źródłowy i docelowy');
        }
        await this.decrementStock(tx, productId, dto.sourceWarehouseId, dto.quantity!);
        await this.incrementStock(tx, productId, dto.targetWarehouseId, dto.quantity!);
        break;
      // ASSIGN_* i LOOKUP nie zmieniają stanu magazynowego — tylko log w CodeScanEvent
    }
  }

  private async decrementStock(tx: any, productId: string, warehouseId: string, qty: number) {
    const stock = await tx.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    if (!stock || stock.quantity < qty) {
      throw new BadRequestException('Niewystarczający stan magazynowy');
    }
    await tx.stockLevel.update({
      where: { productId_warehouseId: { productId, warehouseId } },
      data: { quantity: { decrement: qty } },
    });
  }

  private async incrementStock(tx: any, productId: string, warehouseId: string, qty: number) {
    await tx.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      update: { quantity: { increment: qty } },
      create: { productId, warehouseId, quantity: qty },
    });
  }

  private buildCodeValue(symbology: CodeSymbology, targetType: CodeTargetType, targetId: string) {
    if (symbology === 'QR') {
      // QR koduje pełny, unikalny identyfikator — brak formatu numerycznego
      return `${targetType}:${targetId}:${randomUUID()}`;
    }
    if (symbology === 'EAN_13') {
      return this.generateEan13();
    }
    // CODE_128 — dowolna długość alfanumeryczna
    return `${targetType.slice(0, 3)}-${targetId}`.toUpperCase();
  }

  private generateEan13(): string {
    const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
    const checksum =
      (10 -
        (base.reduce((sum, digit, i) => sum + digit * (i % 2 === 0 ? 1 : 3), 0) % 10)) %
      10;
    return [...base, checksum].join('');
  }
}
