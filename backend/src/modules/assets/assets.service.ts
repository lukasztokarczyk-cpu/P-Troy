import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import {
  CreateAssetCategoryDto,
  CreateAssetStatusDto,
  CreateAssetDto,
  UpdateAssetDto,
  AssignAssetDto,
  ReturnAssetDto,
  TransferAssetDto,
  RespondTransferDto,
  SetAssetStatusDto,
  ReportAssetIssueDto,
} from './dto/asset.dto';
import { Role } from '@prisma/client';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  DAMAGED: 'Uszkodzony',
  TO_REPAIR: 'Do naprawy',
  IN_SERVICE: 'W serwisie',
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: FileStorageService,
  ) {}

  // ---- Kategorie (w pełni edytowalne przez administratora) ----

  findCategories() {
    return this.prisma.assetCategory.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(dto: CreateAssetCategoryDto) {
    return this.prisma.assetCategory.create({ data: dto });
  }

  updateCategory(id: string, dto: CreateAssetCategoryDto) {
    return this.prisma.assetCategory.update({ where: { id }, data: dto });
  }

  async removeCategory(id: string) {
    const inUse = await this.prisma.asset.count({ where: { categoryId: id } });
    if (inUse > 0) {
      throw new BadRequestException(`Nie można usunąć kategorii — przypisano do niej ${inUse} szt. sprzętu`);
    }
    return this.prisma.assetCategory.delete({ where: { id } });
  }

  // ---- Statusy (w pełni edytowalne przez administratora) ----

  findStatuses() {
    return this.prisma.assetStatus.findMany({ orderBy: { name: 'asc' } });
  }

  createStatus(dto: CreateAssetStatusDto) {
    return this.prisma.assetStatus.create({ data: dto });
  }

  updateStatus(id: string, dto: CreateAssetStatusDto) {
    return this.prisma.assetStatus.update({ where: { id }, data: dto });
  }

  async removeStatus(id: string) {
    const inUse = await this.prisma.asset.count({ where: { statusId: id } });
    if (inUse > 0) {
      throw new BadRequestException(`Nie można usunąć statusu — przypisano go do ${inUse} szt. sprzętu`);
    }
    return this.prisma.assetStatus.delete({ where: { id } });
  }

  // ---- Sprzęt: CRUD, wyszukiwanie ----

  /**
   * "Instalator... Widzi jedynie: gdzie aktualnie znajduje się sprzęt,
   * kto jest jego obecnym użytkownikiem" — dla nieuprzywilejowanych ról
   * lista jest zawężona do sprzętu aktualnie przypisanego danej osobie
   * (analogicznie do SitesService.findMany).
   */
  async findMany(
    requesterId: string,
    requesterRole: Role,
    filter: { search?: string; categoryId?: string; statusId?: string; warehouseId?: string; holderUserId?: string },
  ) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;

    return this.prisma.asset.findMany({
      where: {
        ...(isPrivileged ? {} : { holderUserId: requesterId }),
        ...(filter.categoryId && { categoryId: filter.categoryId }),
        ...(filter.statusId && { statusId: filter.statusId }),
        ...(filter.warehouseId && { warehouseId: filter.warehouseId }),
        ...(filter.holderUserId && { holderUserId: filter.holderUserId }),
        ...(filter.search && {
          OR: [
            { name: { contains: filter.search } },
            { serialNumber: { contains: filter.search } },
            { manufacturer: { contains: filter.search } },
            { model: { contains: filter.search } },
          ],
        }),
      },
      include: {
        category: true,
        status: true,
        warehouse: true,
        holderUser: { select: { id: true, firstName: true, lastName: true } },
        photos: { take: 1, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requesterRole: Role) {
    const isPrivileged = requesterRole === Role.ADMIN || requesterRole === Role.KIEROWNIK;

    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        category: true,
        status: true,
        warehouse: true,
        holderUser: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        photos: { orderBy: { createdAt: 'desc' } },
        issueReports: { include: { reportedBy: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } },
        transfers: {
          include: {
            fromUser: { select: { firstName: true, lastName: true } },
            toUser: { select: { firstName: true, lastName: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        // "Instalator nie widzi historii" — dociągana warunkowo niżej,
        // nie w tym include (Prisma nie ma warunkowego include per rola)
        ...(isPrivileged && {
          history: { include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } },
        }),
      },
    });
    if (!asset) throw new NotFoundException('Sprzęt nie został znaleziony');

    const photos = await Promise.all(
      asset.photos.map(async (p) => ({ ...p, url: await this.storage.getSignedUrl(p.path).catch(() => null) })),
    );
    const issueReports = await Promise.all(
      asset.issueReports.map(async (r) => ({
        ...r,
        photoUrl: r.photoPath ? await this.storage.getSignedUrl(r.photoPath).catch(() => null) : null,
      })),
    );

    return { ...asset, photos, issueReports, history: (asset as any).history ?? [] };
  }

  async create(dto: CreateAssetDto, createdById: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);

    let statusId = dto.statusId;
    if (!statusId) {
      const defaultStatus = await this.prisma.assetStatus.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!defaultStatus) throw new BadRequestException('Brak zdefiniowanych statusów — utwórz co najmniej jeden status sprzętu');
      statusId = defaultStatus.id;
    }

    const asset = await this.prisma.asset.create({
      data: {
        name: dto.name,
        categoryId: dto.categoryId,
        manufacturer: dto.manufacturer,
        model: dto.model,
        serialNumber: dto.serialNumber,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        warrantyEndDate: dto.warrantyEndDate ? new Date(dto.warrantyEndDate) : undefined,
        description: dto.description,
        statusId,
        locationType: 'WAREHOUSE',
        createdById,
      },
    });

    if (dto.photosBase64?.length) {
      await this.prisma.assetPhoto.createMany({
        data: await Promise.all(
          dto.photosBase64.map(async (base64, i) => ({
            assetId: asset.id,
            path: await this.storage.saveBase64Image(base64, `assets/${asset.id}/${Date.now()}-${i}.png`),
          })),
        ),
      });
    }

    return asset;
  }

  async update(id: string, dto: UpdateAssetDto, requesterRole: Role) {
    this.assertPrivileged(requesterRole);
    return this.prisma.asset.update({
      where: { id },
      data: {
        ...dto,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        warrantyEndDate: dto.warrantyEndDate ? new Date(dto.warrantyEndDate) : undefined,
      },
    });
  }

  async remove(id: string, requesterRole: Role) {
    if (requesterRole !== Role.ADMIN) {
      throw new ForbiddenException('Usuwanie sprzętu jest dostępne wyłącznie dla administratora');
    }
    return this.prisma.asset.delete({ where: { id } });
  }

  // ---- Lokalizacja / przypisanie ----

  private describeLocation(asset: {
    locationType: string;
    warehouse?: { name: string } | null;
    holderUser?: { firstName: string; lastName: string } | null;
    otherHolderText?: string | null;
  }): string {
    if (asset.locationType === 'WAREHOUSE') return `Magazyn: ${asset.warehouse?.name ?? '—'}`;
    if (asset.locationType === 'OTHER') return `Inne: ${asset.otherHolderText ?? '—'}`;
    if (asset.holderUser) return `${asset.locationType === 'ADMIN' ? 'Administrator' : 'Instalator'}: ${asset.holderUser.firstName} ${asset.holderUser.lastName}`;
    return asset.locationType;
  }

  /**
   * Statusy są w pełni edytowalne przez admina, więc NIE można sztywno
   * zakładać ich istnienia — to dopasowanie "best effort" po nazwie
   * (kolejność = priorytet). Jeśli żadna z podanych nazw nie istnieje
   * (bo admin je usunął/zmienił), zwraca null i status pozostaje bez
   * zmian — ręczna zmiana przez admina zawsze jest możliwa niezależnie.
   */
  private async findStatusByAnyName(names: string[]): Promise<string | null> {
    const status = await this.prisma.assetStatus.findFirst({ where: { name: { in: names } } });
    return status?.id ?? null;
  }

  /** Bezpośrednie wydanie sprzętu — administrator wybiera instalatora / administratora / "inny" (dowolny tekst) */
  async assign(id: string, dto: AssignAssetDto, requesterId: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);

    const before = await this.prisma.asset.findUniqueOrThrow({
      where: { id },
      include: { warehouse: true, holderUser: { select: { firstName: true, lastName: true } } },
    });

    // Best-effort: status podąża za lokalizacją, ale admin zawsze może
    // to nadpisać ręcznie (patrz setStatus) — patrz findStatusByAnyName
    const statusId = await this.findStatusByAnyName(['Wypożyczony', 'U instalatora']);

    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        locationType: dto.locationType,
        holderUserId: dto.locationType === 'OTHER' ? null : dto.holderUserId,
        otherHolderText: dto.locationType === 'OTHER' ? dto.otherHolderText : null,
        warehouseId: null,
        ...(statusId && { statusId }),
      },
      include: { warehouse: true, holderUser: { select: { firstName: true, lastName: true } } },
    });

    await this.prisma.assetHistoryEntry.create({
      data: {
        assetId: id,
        userId: requesterId,
        previousLocation: this.describeLocation(before),
        newLocation: this.describeLocation(asset),
      },
    });

    return asset;
  }

  /** "Sprzęt wrócił" — wybór magazynu docelowego */
  async returnToWarehouse(id: string, dto: ReturnAssetDto, requesterId: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);

    const before = await this.prisma.asset.findUniqueOrThrow({
      where: { id },
      include: { warehouse: true, holderUser: { select: { firstName: true, lastName: true } } },
    });

    const statusId = await this.findStatusByAnyName(['W magazynie', 'Dostępny']);

    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        locationType: 'WAREHOUSE',
        warehouseId: dto.warehouseId,
        holderUserId: null,
        otherHolderText: null,
        ...(statusId && { statusId }),
      },
      include: { warehouse: true },
    });

    await this.prisma.assetHistoryEntry.create({
      data: {
        assetId: id,
        userId: requesterId,
        previousLocation: this.describeLocation(before),
        newLocation: this.describeLocation(asset),
        comment: 'Zwrot do magazynu',
      },
    });

    await this.notifications.notifyRoles(['ADMIN'], {
      type: 'ASSET_RETURNED_TO_WAREHOUSE',
      title: 'Sprzęt wrócił do magazynu',
      message: `"${asset.name}" wrócił do magazynu ${asset.warehouse?.name ?? ''}`,
      entityType: 'Asset',
      entityId: id,
    });

    return asset;
  }

  // ---- Przekazanie z potwierdzeniem/odrzuceniem ----

  /**
   * "Administrator wybiera: Przekaż do: → Instalator B. System tworzy
   * oczekujące przekazanie." — inicjuje wyłącznie administrator/brygadzista;
   * faktyczna zmiana posiadacza następuje dopiero po potwierdzeniu (patrz
   * confirmTransfer), nie od razu.
   */
  async createTransfer(id: string, dto: TransferAssetDto, requesterId: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);

    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id } });
    const pending = await this.prisma.assetTransfer.findFirst({ where: { assetId: id, status: 'PENDING' } });
    if (pending) throw new BadRequestException('Dla tego sprzętu istnieje już oczekujące przekazanie');

    const transfer = await this.prisma.assetTransfer.create({
      data: { assetId: id, fromUserId: asset.holderUserId, toUserId: dto.toUserId, createdById: requesterId },
    });

    await this.notifications.notifyUsers([dto.toUserId], {
      type: 'ASSET_TRANSFER_REQUESTED',
      title: 'Oczekuje na potwierdzenie odbioru sprzętu',
      message: `Otrzymujesz "${asset.name}" — potwierdź lub odrzuć odbiór`,
      entityType: 'Asset',
      entityId: id,
    });

    return transfer;
  }

  async confirmTransfer(transferId: string, requesterId: string) {
    const transfer = await this.prisma.assetTransfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { asset: { include: { warehouse: true, holderUser: { select: { firstName: true, lastName: true } } } } },
    });
    if (transfer.toUserId !== requesterId) throw new ForbiddenException('To przekazanie nie jest skierowane do Ciebie');
    if (transfer.status !== 'PENDING') throw new BadRequestException('To przekazanie zostało już rozstrzygnięte');

    const before = transfer.asset;
    const statusId = await this.findStatusByAnyName(['Wypożyczony', 'U instalatora']);

    const [, asset] = await this.prisma.$transaction([
      this.prisma.assetTransfer.update({ where: { id: transferId }, data: { status: 'CONFIRMED', respondedAt: new Date() } }),
      this.prisma.asset.update({
        where: { id: transfer.assetId },
        data: {
          locationType: 'INSTALLER',
          holderUserId: transfer.toUserId,
          warehouseId: null,
          otherHolderText: null,
          ...(statusId && { statusId }),
        },
        include: { holderUser: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    await this.prisma.assetHistoryEntry.create({
      data: {
        assetId: transfer.assetId,
        userId: requesterId,
        previousLocation: this.describeLocation(before),
        newLocation: this.describeLocation(asset as any),
        comment: 'Przekazanie potwierdzone',
      },
    });

    await this.notifications.notifyRoles(['ADMIN'], {
      type: 'ASSET_TRANSFER_CONFIRMED',
      title: 'Potwierdzono odbiór sprzętu',
      message: `${asset.holderUser?.firstName} ${asset.holderUser?.lastName} potwierdził odbiór "${asset.name}"`,
      entityType: 'Asset',
      entityId: transfer.assetId,
    });

    return asset;
  }

  async rejectTransfer(transferId: string, dto: RespondTransferDto, requesterId: string) {
    const transfer = await this.prisma.assetTransfer.findUniqueOrThrow({
      where: { id: transferId },
      include: {
        asset: true,
        toUser: { select: { firstName: true, lastName: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (transfer.toUserId !== requesterId) throw new ForbiddenException('To przekazanie nie jest skierowane do Ciebie');
    if (transfer.status !== 'PENDING') throw new BadRequestException('To przekazanie zostało już rozstrzygnięte');

    await this.prisma.assetTransfer.update({
      where: { id: transferId },
      data: { status: 'REJECTED', respondedAt: new Date(), rejectReason: dto.reason },
    });

    // Powiadomienie zawiera wszystkie elementy wymagane specyfikacją:
    // nazwę sprzętu, kto próbował przekazać, kto odrzucił, datę/godzinę, powód
    const when = new Date().toLocaleString('pl-PL');
    await this.notifications.notifyRoles(['ADMIN'], {
      type: 'ASSET_TRANSFER_REJECTED',
      title: 'Odrzucono przekazanie sprzętu',
      message:
        `"${transfer.asset.name}" — ${transfer.createdBy.firstName} ${transfer.createdBy.lastName} → ` +
        `${transfer.toUser.firstName} ${transfer.toUser.lastName}, odrzucone ${when}` +
        (dto.reason ? `. Powód: ${dto.reason}` : ''),
      entityType: 'Asset',
      entityId: transfer.assetId,
    });

    return { rejected: true };
  }

  // ---- Zgłaszanie uszkodzeń ----

  /** "Administrator oraz instalator mogą oznaczyć sprzęt jako: Uszkodzony / Do naprawy / W serwisie" */
  async reportIssue(id: string, dto: ReportAssetIssueDto, reportedById: string) {
    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id } });

    const photoPath = dto.photoBase64
      ? await this.storage.saveBase64Image(dto.photoBase64, `assets/${id}/issues/${Date.now()}.png`)
      : undefined;

    const report = await this.prisma.assetIssueReport.create({
      data: { assetId: id, type: dto.type, description: dto.description, photoPath, reportedById },
    });

    await this.notifications.notifyRoles(['ADMIN'], {
      type: 'ASSET_ISSUE_REPORTED',
      title: `Zgłoszono: ${ISSUE_TYPE_LABELS[dto.type]}`,
      message: `"${asset.name}" — ${ISSUE_TYPE_LABELS[dto.type]}${dto.description ? `: ${dto.description}` : ''}`,
      entityType: 'Asset',
      entityId: id,
    });

    return report;
  }

  // ---- Zmiana statusu (swobodna, np. "Dostępny" po naprawie) ----

  async setStatus(id: string, dto: SetAssetStatusDto, requesterId: string, requesterRole: Role) {
    this.assertPrivileged(requesterRole);
    const before = await this.prisma.asset.findUniqueOrThrow({ where: { id }, include: { status: true } });
    const asset = await this.prisma.asset.update({ where: { id }, data: { statusId: dto.statusId }, include: { status: true } });

    await this.prisma.assetHistoryEntry.create({
      data: {
        assetId: id,
        userId: requesterId,
        previousLocation: this.describeLocation(before as any),
        newLocation: this.describeLocation(asset as any),
        statusChange: `${before.status.name} → ${asset.status.name}`,
        comment: dto.comment,
      },
    });

    return asset;
  }

  private assertPrivileged(role: Role) {
    if (role !== Role.ADMIN && role !== Role.KIEROWNIK) {
      throw new ForbiddenException('Brak uprawnień do zarządzania sprzętem');
    }
  }
}
