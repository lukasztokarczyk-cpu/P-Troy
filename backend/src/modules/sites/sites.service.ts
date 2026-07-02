import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSiteDto, UpdateSiteDto, AddSiteNoteDto, CreateChecklistDto } from './dto/site.dto';
import { Role } from '@prisma/client';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findMany(requesterId: string, requesterRole: Role) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;
    return this.prisma.site.findMany({
      where: {
        isArchived: false,
        ...(isPrivileged ? {} : { assignees: { some: { userId: requesterId } } }),
      },
      include: {
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        _count: { select: { tasks: true, media: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findUnique({
      where: { id },
      include: {
        assignees: { include: { user: true } },
        media: { orderBy: { takenAt: 'desc' }, take: 50 },
        plans: true,
        documents: true,
        notes: { include: { author: true }, orderBy: { createdAt: 'desc' } },
        comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
        checklists: { include: { items: true } },
        materialUsages: { include: { product: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!site) throw new NotFoundException('Budowa nie została znaleziona');
    return site;
  }

  async create(dto: CreateSiteDto, createdById: string) {
    return this.prisma.site.create({
      data: {
        name: dto.name,
        investor: dto.investor,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        priority: dto.priority,
        createdById,
        assignees: dto.assigneeIds
          ? { create: dto.assigneeIds.map((userId) => ({ userId, assignedByAdmin: true })) }
          : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateSiteDto, requesterRole: Role) {
    this.assertPrivileged(requesterRole);
    return this.prisma.$transaction(async (tx) => {
      const site = await tx.site.update({
        where: { id },
        data: {
          name: dto.name,
          investor: dto.investor,
          address: dto.address,
          description: dto.description,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          status: dto.status,
          priority: dto.priority,
          ...(dto.assigneeIds && {
            assignees: { deleteMany: {}, create: dto.assigneeIds.map((userId) => ({ userId, assignedByAdmin: true })) },
          }),
        },
      });
      return site;
    });
  }

  async archive(id: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);
    return this.prisma.site.update({ where: { id }, data: { isArchived: true, status: 'ARCHIVED' } });
  }

  async remove(id: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);
    return this.prisma.site.delete({ where: { id } });
  }

  /**
   * "Jeżeli pracownik sam wybierze budowę, do której nie został
   * przypisany — system pozwala mu to zrobić, administrator natychmiast
   * otrzymuje powiadomienie, zapisuje się historia zdarzenia."
   */
  async selfJoin(siteId: string, userId: string) {
    const existing = await this.prisma.siteAssignee.findUnique({
      where: { siteId_userId: { siteId, userId } },
    });

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    await this.prisma.$transaction(async (tx) => {
      if (!existing) {
        await tx.siteAssignee.create({ data: { siteId, userId, assignedByAdmin: false } });
      }
      await tx.siteJoinEvent.create({ data: { siteId, userId, wasSelfAssigned: !existing } });
    });

    if (!existing) {
      await this.notifications.notifyRoles(['ADMIN', 'KIEROWNIK'], {
        type: 'SITE_SELF_ASSIGNED',
        title: 'Pracownik dołączył do budowy',
        message: `Pracownik dołączył samodzielnie do budowy "${site.name}" bez wcześniejszego przypisania`,
        entityType: 'Site',
        entityId: siteId,
      });
    }

    return { joined: true, wasAlreadyAssigned: !!existing };
  }

  async addNote(siteId: string, dto: AddSiteNoteDto, authorId: string) {
    return this.prisma.siteNote.create({ data: { siteId, authorId, content: dto.content } });
  }

  async createChecklist(siteId: string, dto: CreateChecklistDto) {
    return this.prisma.siteChecklist.create({
      data: {
        siteId,
        title: dto.title,
        items: { create: dto.items.map((label, order) => ({ label, order })) },
      },
      include: { items: true },
    });
  }

  async toggleChecklistItem(itemId: string, isDone: boolean) {
    return this.prisma.siteChecklistItem.update({ where: { id: itemId }, data: { isDone } });
  }

  private assertPrivileged(role: Role) {
    if (role !== Role.ADMIN && role !== Role.KIEROWNIK) {
      throw new ForbiddenException('Brak uprawnień do zarządzania budowami');
    }
  }
}
