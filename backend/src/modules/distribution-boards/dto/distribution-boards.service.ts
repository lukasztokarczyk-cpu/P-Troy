import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateDistributionBoardDto, UpdateDistributionBoardDto,
  CreateDistributionBoardDeviceDto, UpdateDistributionBoardDeviceDto,
  CreateSiteRackDto, UpdateSiteRackDto,
  CreateSiteFireSafetyItemDto, UpdateSiteFireSafetyItemDto,
} from './dto/distribution-board.dto';
import { Role } from '@prisma/client';

// Widoczność: każdy zalogowany widzi dokumentację elektryczną budowy
// (przejrzystość jest korzystna — instalator wchodzący na budowę po
// koledze musi wiedzieć "co jest gdzie"). Dodawanie/edycja: każda rola
// (instalator fizycznie montuje rozdzielnię i najlepiej wie co opisać).
// Usuwanie: wyłącznie administrator/brygadzista (spójne z resztą
// aplikacji — instalator nigdy nie usuwa rekordów, patrz sekcja Role).
function assertCanDelete(role: Role) {
  if (role !== Role.ADMIN && role !== Role.KIEROWNIK) {
    throw new ForbiddenException('Tylko administrator lub brygadzista może usuwać ten element');
  }
}

@Injectable()
export class DistributionBoardsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Rozdzielnie ----

  findBoards(siteId: string) {
    return this.prisma.distributionBoard.findMany({
      where: { siteId },
      include: { devices: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBoard(siteId: string, dto: CreateDistributionBoardDto, createdById: string) {
    return this.prisma.distributionBoard.create({
      data: { ...dto, siteId, createdById },
      include: { devices: true },
    });
  }

  async updateBoard(id: string, dto: UpdateDistributionBoardDto) {
    await this.prisma.distributionBoard.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('Rozdzielnia nie została znaleziona');
    });
    return this.prisma.distributionBoard.update({ where: { id }, data: dto });
  }

  async deleteBoard(id: string, requesterRole: Role) {
    assertCanDelete(requesterRole);
    await this.prisma.distributionBoard.delete({ where: { id } });
    return { success: true };
  }

  // ---- Aparaty w rozdzielni ----

  async createDevice(boardId: string, dto: CreateDistributionBoardDeviceDto) {
    await this.prisma.distributionBoard.findUniqueOrThrow({ where: { id: boardId } }).catch(() => {
      throw new NotFoundException('Rozdzielnia nie została znaleziona');
    });
    return this.prisma.distributionBoardDevice.create({ data: { ...dto, boardId } });
  }

  async updateDevice(id: string, dto: UpdateDistributionBoardDeviceDto) {
    await this.prisma.distributionBoardDevice.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('Aparat nie został znaleziony');
    });
    return this.prisma.distributionBoardDevice.update({ where: { id }, data: dto });
  }

  async deleteDevice(id: string, requesterRole: Role) {
    assertCanDelete(requesterRole);
    await this.prisma.distributionBoardDevice.delete({ where: { id } });
    return { success: true };
  }

  // ---- Szafy rack/LAN ----

  findRacks(siteId: string) {
    return this.prisma.siteRack.findMany({ where: { siteId }, orderBy: { createdAt: 'asc' } });
  }

  async createRack(siteId: string, dto: CreateSiteRackDto, createdById: string) {
    return this.prisma.siteRack.create({ data: { ...dto, siteId, createdById } });
  }

  async updateRack(id: string, dto: UpdateSiteRackDto) {
    await this.prisma.siteRack.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('Szafa rack nie została znaleziona');
    });
    return this.prisma.siteRack.update({ where: { id }, data: dto });
  }

  async deleteRack(id: string, requesterRole: Role) {
    assertCanDelete(requesterRole);
    await this.prisma.siteRack.delete({ where: { id } });
    return { success: true };
  }

  // ---- PPOŻ ----

  findFireSafetyItems(siteId: string) {
    return this.prisma.siteFireSafetyItem.findMany({ where: { siteId }, orderBy: { createdAt: 'asc' } });
  }

  async createFireSafetyItem(siteId: string, dto: CreateSiteFireSafetyItemDto, createdById: string) {
    return this.prisma.siteFireSafetyItem.create({
      data: {
        ...dto,
        siteId,
        createdById,
        lastInspectionDate: dto.lastInspectionDate ? new Date(dto.lastInspectionDate) : undefined,
        nextInspectionDate: dto.nextInspectionDate ? new Date(dto.nextInspectionDate) : undefined,
      },
    });
  }

  async updateFireSafetyItem(id: string, dto: UpdateSiteFireSafetyItemDto) {
    await this.prisma.siteFireSafetyItem.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('Element PPOŻ nie został znaleziony');
    });
    return this.prisma.siteFireSafetyItem.update({
      where: { id },
      data: {
        ...dto,
        lastInspectionDate: dto.lastInspectionDate ? new Date(dto.lastInspectionDate) : undefined,
        nextInspectionDate: dto.nextInspectionDate ? new Date(dto.nextInspectionDate) : undefined,
      },
    });
  }

  async deleteFireSafetyItem(id: string, requesterRole: Role) {
    assertCanDelete(requesterRole);
    await this.prisma.siteFireSafetyItem.delete({ where: { id } });
    return { success: true };
  }
}
