import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import {
  CreateSiteDto,
  UpdateSiteDto,
  AddSiteNoteDto,
  CreateChecklistDto,
  CreateInvestorAgreementDto,
  UpdateInvestorAgreementStatusDto,
  UploadSitePhotoDto,
  UploadSitePlanDto,
} from './dto/site.dto';
import { Role } from '@prisma/client';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: FileStorageService,
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
        investorAgreements: {
          include: {
            createdBy: { select: { firstName: true, lastName: true } },
            decidedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!site) throw new NotFoundException('Budowa nie została znaleziona');
    return site;
  }

  async create(dto: CreateSiteDto, createdById: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);
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

  /**
   * "Mogą się odznaczyć że są" — instalator usuwa własne przypisanie
   * do budowy. Nie może usunąć przypisania nikogo innego (egzekwowane
   * przez userId = requester, niezależnie od tego kto był podany).
   */
  async selfLeave(siteId: string, userId: string) {
    await this.prisma.siteAssignee.deleteMany({ where: { siteId, userId } });
    return { left: true };
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

  // "Uzgodnienie z inwestorem" — każdy przypisany może zgłosić sprawę
  // wymagającą akceptacji inwestora; administrator/brygadzista otrzymuje
  // powiadomienie i później odnotowuje decyzję (patrz updateInvestorAgreementStatus)
  async addInvestorAgreement(siteId: string, dto: CreateInvestorAgreementDto, createdById: string) {
    const attachmentPath = dto.attachmentBase64
      ? await this.storage.saveBase64Image(dto.attachmentBase64, `investor-agreements/${siteId}/${Date.now()}.png`)
      : undefined;

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    const agreement = await this.prisma.investorAgreement.create({
      data: { siteId, title: dto.title, description: dto.description, attachmentPath, createdById },
    });

    await this.notifications.notifyRoles(['ADMIN', 'KIEROWNIK'], {
      type: 'INVESTOR_AGREEMENT_ADDED',
      title: 'Nowe uzgodnienie z inwestorem',
      message: `${site.name}: ${agreement.title}`,
      entityType: 'InvestorAgreement',
      entityId: agreement.id,
    });

    return agreement;
  }

  // Wpisanie decyzji inwestora — tylko administrator/brygadzista, bo to
  // oni faktycznie kontaktują się z inwestorem i odpowiadają za ustalenia
  async updateInvestorAgreementStatus(
    agreementId: string,
    dto: UpdateInvestorAgreementStatusDto,
    requesterId: string,
    requesterRole: Role,
  ) {
    this.assertPrivileged(requesterRole);
    return this.prisma.investorAgreement.update({
      where: { id: agreementId },
      data: {
        status: dto.status,
        decisionNote: dto.decisionNote,
        decidedById: requesterId,
        decidedAt: new Date(),
      },
    });
  }

  private assertPrivileged(role: Role) {
    if (role !== Role.ADMIN && role !== Role.KIEROWNIK) {
      throw new ForbiddenException('Brak uprawnień do zarządzania budowami');
    }
  }

  // ---- Zdjęcia budowy ----
  // Modele (SiteMedia/SitePlan) i tabele w bazie już istniały z
  // wcześniejszej sesji — brakowało wyłącznie tych endpointów, przez co
  // gotowy już kod frontendu (zakładka Dokumentacja) trafiał w 404.

  async findPhotos(siteId: string) {
    const photos = await this.prisma.siteMedia.findMany({
      where: { siteId, type: 'PHOTO' },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: { takenAt: 'desc' },
    });
    return Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        fullResUrl: await this.storage.getSignedUrl(p.fullResPath).catch(() => null),
        thumbnailUrl: await this.storage.getSignedUrl(p.thumbnailPath).catch(() => null),
        description: p.description,
        takenAt: p.takenAt,
        author: p.author,
      })),
    );
  }

  async addPhoto(siteId: string, dto: UploadSitePhotoDto, authorId: string) {
    const buffer = Buffer.from(dto.imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const { fullResPath, thumbnailPath } = await this.storage.savePhotoWithThumbnail(buffer, 'photo.jpg', `sites/${siteId}/photos`);
    return this.prisma.siteMedia.create({
      data: {
        siteId, type: 'PHOTO', fullResPath, thumbnailPath,
        description: dto.description, latitude: dto.latitude, longitude: dto.longitude, authorId,
      },
    });
  }

  // ---- Plany / dokumenty budowy ----

  async findPlans(siteId: string) {
    const plans = await this.prisma.sitePlan.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(
      plans.map(async (p) => ({
        id: p.id, fileName: p.fileName, fileType: p.fileType, createdAt: p.createdAt,
        fileUrl: await this.storage.getSignedUrl(p.filePath).catch(() => null),
      })),
    );
  }

  async addPlan(siteId: string, dto: UploadSitePlanDto, uploadedById: string) {
    const buffer = Buffer.from(dto.fileBase64.replace(/^data:[\w/+-]+;base64,/, ''), 'base64');
    const filePath = await this.storage.saveDocument(buffer, dto.fileName, `sites/${siteId}/plans`);
    return this.prisma.sitePlan.create({
      data: { siteId, fileName: dto.fileName, fileType: dto.fileType, filePath, uploadedById },
    });
  }

  // ---- Podsumowanie budowy (zakładka "Podsumowanie", generowane też
  // przy "Zakończ budowę") — endpoint dotąd nie istniał, mimo gotowego
  // frontendu, dokładnie jak w przypadku zdjęć/planów wyżej.
  async getSummary(siteId: string, asClient: boolean) {
    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    const doneTasks = await this.prisma.task.findMany({
      where: { siteId, status: 'DONE' },
      include: { assignees: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { completedAt: 'asc' },
    });
    const toItem = (t: (typeof doneTasks)[number]) => ({
      title: t.title,
      description: t.completionSummary,
      completedAt: t.completedAt,
      assignees: t.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`),
    });

    let materialsUsed: { product: string; quantity: number; unit: string; date: Date }[] | undefined;
    if (!asClient) {
      const usages = await this.prisma.materialUsage.findMany({
        where: { siteId },
        include: { product: { select: { name: true, unit: true } } },
        orderBy: { createdAt: 'asc' },
      });
      materialsUsed = usages.map((m) => ({ product: m.product.name, quantity: m.quantity, unit: m.product.unit, date: m.createdAt }));
    }

    return {
      site: { name: site.name, investor: site.investor, address: site.address, startDate: site.startDate, completedAt: site.completedAt },
      completedWork: doneTasks.filter((t) => !t.isExtra).map(toItem),
      extraWork: doneTasks.filter((t) => t.isExtra).map(toItem),
      materialsUsed,
    };
  }
}