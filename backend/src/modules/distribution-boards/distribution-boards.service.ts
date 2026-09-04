import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateDistributionBoardDto, UpdateDistributionBoardDto,
  CreateDistributionBoardDeviceDto, UpdateDistributionBoardDeviceDto,
  CreateSiteRackDto, UpdateSiteRackDto,
  CreateRackDeviceDto, UpdateRackDeviceDto, UpdateRackDevicePortDto,
  CreateSiteFireSafetyItemDto, UpdateSiteFireSafetyItemDto,
} from './dto/distribution-board.dto';
import { Role, RackDeviceType } from '@prisma/client';

// Typy urządzeń, dla których zarządzamy portami (switche i patch panele)
const PORTED_DEVICE_TYPES: RackDeviceType[] = [
  RackDeviceType.SWITCH,
  RackDeviceType.SWITCH_POE,
  RackDeviceType.PATCH_PANEL,
];

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
    return this.prisma.siteRack.findMany({
      where: { siteId },
      include: { devices: { include: { ports: { orderBy: { portNumber: 'asc' } } }, orderBy: { startUnit: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findRack(id: string) {
    const rack = await this.prisma.siteRack.findUnique({
      where: { id },
      include: { devices: { include: { ports: { orderBy: { portNumber: 'asc' } } }, orderBy: { startUnit: 'desc' } } },
    });
    if (!rack) throw new NotFoundException('Szafa rack nie została znaleziona');
    return rack;
  }

  async createRack(siteId: string, dto: CreateSiteRackDto, createdById: string) {
    return this.prisma.siteRack.create({ data: { ...dto, siteId, createdById }, include: { devices: true } });
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

  // ---- Urządzenia w szafie rack (pozycje U) ----

  // Sprawdza, czy zakres U [startUnit-unitsSpan+1, startUnit] koliduje
  // z jakimkolwiek innym urządzeniem w tej samej szafie — system nie
  // może pozwolić na umieszczenie dwóch urządzeń w tym samym miejscu.
  private async assertNoUnitOverlap(rackId: string, startUnit: number, unitsSpan: number, excludeDeviceId?: string) {
    const bottomUnit = startUnit - unitsSpan + 1;
    if (bottomUnit < 1) throw new BadRequestException('Urządzenie nie mieści się w szafie (zakres U poniżej 1)');

    const others = await this.prisma.rackDevice.findMany({
      where: { rackId, id: excludeDeviceId ? { not: excludeDeviceId } : undefined },
      select: { id: true, name: true, startUnit: true, unitsSpan: true },
    });
    for (const other of others) {
      const otherBottom = other.startUnit - other.unitsSpan + 1;
      const overlaps = startUnit >= otherBottom && bottomUnit <= other.startUnit;
      if (overlaps) {
        throw new ConflictException(`Zakres U koliduje z urządzeniem "${other.name}" (U${other.startUnit}-U${otherBottom})`);
      }
    }
  }

  async createRackDevice(rackId: string, dto: CreateRackDeviceDto) {
    const rack = await this.prisma.siteRack.findUnique({ where: { id: rackId } });
    if (!rack) throw new NotFoundException('Szafa rack nie została znaleziona');

    const unitsSpan = dto.unitsSpan ?? 1;
    if (rack.unitsCount && dto.startUnit > rack.unitsCount) {
      throw new BadRequestException(`Szafa ma tylko ${rack.unitsCount}U — nie można umieścić urządzenia na U${dto.startUnit}`);
    }
    await this.assertNoUnitOverlap(rackId, dto.startUnit, unitsSpan);

    const isPorted = PORTED_DEVICE_TYPES.includes(dto.type);
    const portsCount = isPorted ? dto.portsCount ?? undefined : undefined;

    return this.prisma.rackDevice.create({
      data: {
        rackId,
        name: dto.name,
        type: dto.type,
        purpose: dto.purpose,
        startUnit: dto.startUnit,
        unitsSpan,
        portsCount,
        description: dto.description,
        ports: portsCount
          ? { create: Array.from({ length: portsCount }, (_, i) => ({ portNumber: i + 1 })) }
          : undefined,
      },
      include: { ports: { orderBy: { portNumber: 'asc' } } },
    });
  }

  async updateRackDevice(id: string, dto: UpdateRackDeviceDto, force?: boolean) {
    const device = await this.prisma.rackDevice.findUnique({ where: { id }, include: { ports: true } });
    if (!device) throw new NotFoundException('Urządzenie nie zostało znalezione');

    const nextType = dto.type ?? device.type;
    const nextStartUnit = dto.startUnit ?? device.startUnit;
    const nextUnitsSpan = dto.unitsSpan ?? device.unitsSpan;
    const isPorted = PORTED_DEVICE_TYPES.includes(nextType);

    if (dto.startUnit !== undefined || dto.unitsSpan !== undefined) {
      const rack = await this.prisma.siteRack.findUnique({ where: { id: device.rackId } });
      if (rack?.unitsCount && nextStartUnit > rack.unitsCount) {
        throw new BadRequestException(`Szafa ma tylko ${rack.unitsCount}U — nie można umieścić urządzenia na U${nextStartUnit}`);
      }
      await this.assertNoUnitOverlap(device.rackId, nextStartUnit, nextUnitsSpan, id);
    }

    // Zmiana liczby portów: jeśli rośnie — dopisujemy nowe puste porty;
    // jeśli maleje — ostrzegamy, gdy usuwane porty mają już przypisane
    // informacje (chyba że force=true, czyli użytkownik potwierdził).
    let portsWrite: any = undefined;
    if (isPorted && dto.portsCount !== undefined) {
      const currentCount = device.ports.length;
      if (dto.portsCount > currentCount) {
        portsWrite = {
          create: Array.from({ length: dto.portsCount - currentCount }, (_, i) => ({ portNumber: currentCount + i + 1 })),
        };
      } else if (dto.portsCount < currentCount) {
        const removed = device.ports.filter((p) => p.portNumber > dto.portsCount!);
        const removedWithData = removed.filter((p) => p.connectionType || p.label || p.location || p.description);
        if (removedWithData.length > 0 && !force) {
          throw new ConflictException(
            `Porty ${removedWithData.map((p) => p.portNumber).join(', ')} mają przypisane informacje — potwierdź usunięcie`,
          );
        }
        portsWrite = { deleteMany: { portNumber: { gt: dto.portsCount } } };
      }
    } else if (!isPorted && device.ports.length > 0) {
      // Zmiana typu na nieportowany — porty przestają mieć sens, ale
      // ostrzegamy tak samo jak przy zmniejszaniu ich liczby, jeśli
      // mają już przypisane informacje
      const withData = device.ports.filter((p) => p.connectionType || p.label || p.location || p.description);
      if (withData.length > 0 && !force) {
        throw new ConflictException('Ten typ urządzenia nie ma portów, a obecne porty mają przypisane informacje — potwierdź usunięcie');
      }
      portsWrite = { deleteMany: {} };
    }

    return this.prisma.rackDevice.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        purpose: dto.purpose,
        startUnit: dto.startUnit,
        unitsSpan: dto.unitsSpan,
        portsCount: isPorted ? dto.portsCount ?? device.portsCount : null,
        description: dto.description,
        ports: portsWrite,
      },
      include: { ports: { orderBy: { portNumber: 'asc' } } },
    });
  }

  async deleteRackDevice(id: string, requesterRole: Role) {
    assertCanDelete(requesterRole);
    await this.prisma.rackDevice.delete({ where: { id } });
    return { success: true };
  }

  // ---- Porty urządzeń (switch/patch panel) ----

  async updateRackDevicePort(id: string, dto: UpdateRackDevicePortDto) {
    await this.prisma.rackDevicePort.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('Port nie został znaleziony');
    });
    return this.prisma.rackDevicePort.update({ where: { id }, data: dto });
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
