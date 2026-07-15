import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '@prisma/client';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  AssignVehicleDto,
  AddEquipmentDto,
  TransferEquipmentDto,
} from './dto/vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findMany() {
    return this.prisma.vehicle.findMany({
      include: {
        assignments: { where: { endDate: null }, include: { user: true } },
        equipment: true,
      },
      orderBy: { registrationNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        assignments: { include: { user: true }, orderBy: { startDate: 'desc' } },
        equipment: {
          include: {
            assignedInstaller: { select: { id: true, firstName: true, lastName: true } },
            transfers: { include: { fromUser: true, toUser: true }, orderBy: { createdAt: 'desc' } },
          },
        },
        materialWarehouse: {
          include: { stockLevels: { include: { product: true } } },
        },
        expenseNotes: {
          where: { type: 'REFUELING' },
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        scheduleEvents: { where: { startDate: { gte: new Date() } }, orderBy: { startDate: 'asc' }, take: 10 },
      },
    });
    if (!vehicle) throw new NotFoundException('Pojazd nie został znaleziony');
    return vehicle;
  }

  create(dto: CreateVehicleDto) {
    return this.prisma.vehicle.create({
      data: {
        ...dto,
        inspectionDueDate: dto.inspectionDueDate ? new Date(dto.inspectionDueDate) : undefined,
        insuranceDueDate: dto.insuranceDueDate ? new Date(dto.insuranceDueDate) : undefined,
        // Każdy pojazd od razu dostaje własny "magazyn" — pozwala to
        // śledzić materiały pozostałe w aucie przez ten sam mechanizm
        // co zwykłe magazyny firmowe (Product/StockLevel), bez
        // budowania osobnego systemu ewidencji od zera
        materialWarehouse: {
          create: { name: `Pojazd: ${dto.registrationNumber}` },
        },
      },
    });
  }

  update(id: string, dto: UpdateVehicleDto) {
    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...dto,
        inspectionDueDate: dto.inspectionDueDate ? new Date(dto.inspectionDueDate) : undefined,
        insuranceDueDate: dto.insuranceDueDate ? new Date(dto.insuranceDueDate) : undefined,
      },
    });
  }

  remove(id: string) {
    return this.prisma.vehicle.delete({ where: { id } });
  }

  // Pojazd może być przypisany do konkretnego instalatora — zamyka
  // poprzednie aktywne przypisanie i otwiera nowe (pełna historia)
  async assign(vehicleId: string, dto: AssignVehicleDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.vehicleAssignment.updateMany({
        where: { vehicleId, endDate: null },
        data: { endDate: new Date() },
      });
      return tx.vehicleAssignment.create({ data: { vehicleId, userId: dto.userId } });
    });
  }

  /**
   * "Wybrać że w danym momencie mają samochód do swojej dyspozycji" —
   * instalator sam się przypisuje do pojazdu (bez potrzeby akcji admina).
   * Zamyka poprzednie aktywne przypisanie (kto miał go wcześniej) i
   * otwiera nowe na siebie — pełna historia zostaje zachowana.
   */
  async claimForSelf(vehicleId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.vehicleAssignment.updateMany({
        where: { vehicleId, endDate: null },
        data: { endDate: new Date() },
      });
      return tx.vehicleAssignment.create({ data: { vehicleId, userId } });
    });
  }

  /**
   * Instalator "oddaje" pojazd — zamyka WYŁĄCZNIE własne aktywne
   * przypisanie (nie może zamknąć przypisania innej osoby).
   */
  async releaseForSelf(vehicleId: string, userId: string) {
    return this.prisma.vehicleAssignment.updateMany({
      where: { vehicleId, userId, endDate: null },
      data: { endDate: new Date() },
    });
  }

  /**
   * "Mogą wpisać gdzie byli" — prosty log lokalizacji, niezależny od
   * formalnego przypisania pojazdu. Dostępny dla każdego zalogowanego
   * użytkownika, każdy wpis zapisuje kto/kiedy/gdzie.
   */
  async logUsage(vehicleId: string, userId: string, location: string, note?: string) {
    return this.prisma.vehicleUsageLog.create({ data: { vehicleId, userId, location, note } });
  }

  async findUsageLogs(vehicleId: string) {
    return this.prisma.vehicleUsageLog.findMany({
      where: { vehicleId },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  addEquipment(vehicleId: string, dto: AddEquipmentDto) {
    return this.prisma.vehicleEquipment.create({ data: { vehicleId, ...dto } });
  }

  // Bezpośrednie przypisanie/zmiana instalatora odpowiedzialnego za
  // dany element wyposażenia (bez pełnego "przekazania" z historią —
  // to jest do tego osobny mechanizm transferEquipment poniżej)
  assignEquipment(equipmentId: string, installerId: string | null) {
    return this.prisma.vehicleEquipment.update({
      where: { id: equipmentId },
      data: { assignedInstallerId: installerId },
    });
  }

  /**
   * "Instalator może przekazać swój sprzęt innemu instalatorowi. Po
   * przekazaniu administrator otrzymuje natychmiastowe powiadomienie,
   * zapisuje się historia przekazania."
   */
  async transferEquipment(equipmentId: string, dto: TransferEquipmentDto, fromUserId: string) {
    const equipment = await this.prisma.vehicleEquipment.findUniqueOrThrow({
      where: { id: equipmentId },
      include: { vehicle: true },
    });

    const transfer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.equipmentTransfer.create({
        data: { equipmentId, fromUserId, toUserId: dto.toUserId, reason: dto.reason },
      });

      // Sprzęt "podąża" za nowym właścicielem — przenosimy go na pojazd
      // aktualnie przypisany do odbiorcy (jeśli istnieje) i aktualizujemy
      // przypisanego instalatora niezależnie od tego, czy zmienił się pojazd
      const targetAssignment = await tx.vehicleAssignment.findFirst({
        where: { userId: dto.toUserId, endDate: null },
      });
      await tx.vehicleEquipment.update({
        where: { id: equipmentId },
        data: {
          assignedInstallerId: dto.toUserId,
          vehicleId: targetAssignment ? targetAssignment.vehicleId : undefined,
        },
      });

      return created;
    });

    await this.notifications.notifyRoles(['ADMIN', 'KIEROWNIK'], {
      type: 'EQUIPMENT_TRANSFERRED',
      title: 'Przekazano sprzęt',
      message: `Sprzęt "${equipment.name}" przekazany między instalatorami. Powód: ${dto.reason}`,
      entityType: 'VehicleEquipment',
      entityId: equipmentId,
    });

    return transfer;
  }

  // Kandydaci do powiadomienia "zbliża się przegląd pojazdu" — wywoływane crona
  async findVehiclesWithUpcomingInspection(daysAhead: number) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);
    return this.prisma.vehicle.findMany({
      where: { inspectionDueDate: { lte: threshold, gte: new Date() } },
      include: { assignments: { where: { endDate: null }, include: { user: true } } },
    });
  }

  /**
   * "Ewidencja materiałów pozostałych w samochodzie... możliwość
   * ręcznego wpisania innych materiałów (np. złączki)". Edycja stanu
   * w magazynie-pojeździe jest dozwolona administratorowi/kierownikowi
   * ORAZ instalatorowi aktualnie przypisanemu do tego konkretnego
   * pojazdu — inaczej niż w głównym Magazynie (tam edycja stanów jest
   * zarezerwowana dla ADMIN/MAGAZYNIER), bo to są materiały "pod ręką"
   * samego instalatora, nie firmowy magazyn.
   */
  async setMaterialStock(
    vehicleId: string,
    productId: string,
    quantity: number,
    requesterId: string,
    requesterRole: Role,
  ) {
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      include: { materialWarehouse: true, assignments: { where: { endDate: null } } },
    });

    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    const isAssignedHere = vehicle.assignments.some((a) => a.userId === requesterId);
    if (!isPrivileged && !isAssignedHere) {
      throw new ForbiddenException('Możesz edytować materiały wyłącznie w pojeździe, który masz aktualnie przypisany');
    }
    if (!vehicle.materialWarehouse) {
      throw new NotFoundException('Ten pojazd nie ma jeszcze własnego magazynu materiałów');
    }

    return this.prisma.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId: vehicle.materialWarehouse.id } },
      update: { quantity },
      create: { productId, warehouseId: vehicle.materialWarehouse.id, quantity },
    });
  }
}
