import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
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
        equipment: { include: { transfers: { include: { fromUser: true, toUser: true }, orderBy: { createdAt: 'desc' } } } },
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
      // aktualnie przypisany do odbiorcy (jeśli istnieje)
      const targetAssignment = await tx.vehicleAssignment.findFirst({
        where: { userId: dto.toUserId, endDate: null },
      });
      if (targetAssignment) {
        await tx.vehicleEquipment.update({
          where: { id: equipmentId },
          data: { vehicleId: targetAssignment.vehicleId },
        });
      }

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
}
