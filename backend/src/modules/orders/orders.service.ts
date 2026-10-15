import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  ACTIVE_SITE_STATUSES,
  ItemInput,
  NormalizedItem,
  OPEN_STATUSES,
  ORDER_STATUS_LABELS,
  OrderStatusKey,
  diffItems,
  nextOrderNumber,
  normalizeItem,
  orderPdfFileName,
  orderPermissions,
  validateItems,
  warsawYear,
} from './orders-logic';
import { DEFAULT_CATALOG } from './catalog.seed';
import {
  ChangeStatusDto,
  CreateCatalogItemDto,
  CreateCategoryDto,
  CreateOrderDto,
  ListOrdersQuery,
  PrintOrderDto,
  UpdateCatalogItemDto,
  UpdateCategoryDto,
  UpdateOrderDto,
  UploadOrderPhotoDto,
} from './dto/order.dto';
import { OrdersPdfService, OrderPdfInput } from './orders-pdf.service';

const isPrivileged = (role: Role | string) => role === 'ADMIN' || role === 'KIEROWNIK';
const isAdmin = (role: Role | string) => role === 'ADMIN';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_ORDER = 40;
const MAX_PDF_PHOTOS = 24;
const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);

const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly notifications: NotificationsService,
    private readonly pdf: OrdersPdfService,
  ) {}

  // =========================================================================
  // Start: kafelek „Zamówienia” + domyślny katalog (każda część w try/catch —
  // niezłapany wyjątek w onModuleInit wywala całą aplikację)
  // =========================================================================

  async onModuleInit() {
    try {
      const tile = await this.prisma.dashboardModule.findUnique({ where: { key: 'orders' } });
      if (!tile) {
        const max = await this.prisma.dashboardModule.aggregate({ _max: { order: true } });
        await this.prisma.dashboardModule.create({
          data: {
            key: 'orders',
            name: 'Zamówienia',
            description: 'Materiały na budowy',
            icon: 'ShoppingCart',
            route: '/orders',
            color: '#f97316',
            order: (max._max.order ?? 0) + 1,
            isSystem: true,
          },
        });
        this.logger.log('Dodano kafelek „Zamówienia”');
      }
    } catch (err) {
      this.logger.warn(`Nie udało się dodać kafelka „Zamówienia”: ${(err as Error).message}`);
    }
    try {
      // Katalog zasilamy tylko raz (pusta tabela) — później zarządza nim administrator.
      const count = await this.prisma.materialCategory.count();
      if (count === 0) {
        for (const [ci, cat] of DEFAULT_CATALOG.entries()) {
          await this.prisma.materialCategory.create({
            data: {
              name: cat.name,
              sortOrder: ci,
              items: {
                create: cat.items.map((it, ii) => ({
                  name: it.name,
                  defaultUnit: it.unit ?? 'szt.',
                  specHint: it.hint ?? null,
                  sortOrder: ii,
                })),
              },
            },
          });
        }
        this.logger.log('Wczytano domyślny katalog materiałów');
      }
    } catch (err) {
      this.logger.warn(`Nie udało się wczytać katalogu materiałów: ${(err as Error).message}`);
    }
  }

  // =========================================================================
  // Katalog materiałów
  // =========================================================================

  async getCatalog(user: AuthenticatedUser, includeInactive = false) {
    const all = includeInactive && isAdmin(user.role);
    return this.prisma.materialCategory.findMany({
      where: all ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: all ? {} : { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, categoryId: true, name: true, defaultUnit: true, specHint: true, isActive: true, sortOrder: true },
        },
      },
    });
  }

  private assertAdmin(user: AuthenticatedUser) {
    if (!isAdmin(user.role)) throw new ForbiddenException('Katalogiem zarządza administrator');
  }

  async createCategory(dto: CreateCategoryDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const max = await this.prisma.materialCategory.aggregate({ _max: { sortOrder: true } });
    try {
      return await this.prisma.materialCategory.create({ data: { name: dto.name.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    } catch (err) {
      if ((err as any)?.code === 'P2002') throw new ConflictException('Kategoria o takiej nazwie już istnieje');
      throw err;
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    try {
      return await this.prisma.materialCategory.update({
        where: { id },
        data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}), ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}) },
      });
    } catch (err) {
      if ((err as any)?.code === 'P2025') throw new NotFoundException('Nie znaleziono kategorii');
      if ((err as any)?.code === 'P2002') throw new ConflictException('Kategoria o takiej nazwie już istnieje');
      throw err;
    }
  }

  async createCatalogItem(dto: CreateCatalogItemDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const cat = await this.prisma.materialCategory.findUnique({ where: { id: dto.categoryId } });
    if (!cat) throw new NotFoundException('Nie znaleziono kategorii');
    const max = await this.prisma.materialCatalogItem.aggregate({ where: { categoryId: dto.categoryId }, _max: { sortOrder: true } });
    return this.prisma.materialCatalogItem.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        defaultUnit: dto.defaultUnit?.trim() || 'szt.',
        specHint: dto.specHint?.trim() || null,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateCatalogItem(id: string, dto: UpdateCatalogItemDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const data: Prisma.MaterialCatalogItemUncheckedUpdateInput = {};
    if (dto.categoryId !== undefined) {
      const cat = await this.prisma.materialCategory.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new NotFoundException('Nie znaleziono kategorii');
      data.categoryId = dto.categoryId;
    }
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.defaultUnit !== undefined) data.defaultUnit = dto.defaultUnit.trim() || 'szt.';
    if (dto.specHint !== undefined) data.specHint = dto.specHint.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    try {
      return await this.prisma.materialCatalogItem.update({ where: { id }, data });
    } catch (err) {
      if ((err as any)?.code === 'P2025') throw new NotFoundException('Nie znaleziono pozycji katalogu');
      throw err;
    }
  }

  // =========================================================================
  // Budowy dostępne dla użytkownika (ta sama baza budów co reszta aplikacji)
  // =========================================================================

  private activeSiteWhere(user: AuthenticatedUser, siteId?: string): Prisma.SiteWhereInput {
    return {
      ...(siteId ? { id: siteId } : {}),
      isArchived: false,
      status: { in: ACTIVE_SITE_STATUSES as any },
      ...(isPrivileged(user.role) ? {} : { assignees: { some: { userId: user.id } } }),
    };
  }

  async availableSites(user: AuthenticatedUser) {
    return this.prisma.site.findMany({
      where: this.activeSiteWhere(user),
      select: { id: true, name: true, address: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Uprawnienia sprawdzane po stronie backendu — nie da się obejść ręczną zmianą żądania API. */
  private async assertSiteAllowed(user: AuthenticatedUser, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: this.activeSiteWhere(user, siteId),
      select: { id: true, name: true, address: true },
    });
    if (!site) {
      throw new ForbiddenException('Nie można przypisać zamówienia do tej budowy — jest nieaktywna albo nie jesteś do niej przypisany.');
    }
    return site;
  }

  // =========================================================================
  // Podsumowanie (licznik na kafelku)
  // =========================================================================

  async summary(user: AuthenticatedUser) {
    const scope: Prisma.OrderWhereInput = isPrivileged(user.role) ? {} : { createdById: user.id };
    const [pending, toProcess, drafts] = await Promise.all([
      this.prisma.order.count({ where: { ...scope, status: { in: OPEN_STATUSES as OrderStatus[] } } }),
      isPrivileged(user.role) ? this.prisma.order.count({ where: { status: 'SENT' } }) : Promise.resolve(0),
      this.prisma.order.count({ where: { createdById: user.id, status: 'DRAFT' } }),
    ]);
    return { pending, toProcess, drafts };
  }

  // =========================================================================
  // Lista i szczegóły
  // =========================================================================

  private visibilityFilter(user: AuthenticatedUser): Prisma.OrderWhereInput {
    if (!isPrivileged(user.role)) return { createdById: user.id };
    // Cudze wersje robocze są prywatne dla autora — administrator widzi zamówienia od momentu wysłania.
    return { OR: [{ status: { not: 'DRAFT' } }, { createdById: user.id }] };
  }

  async list(user: AuthenticatedUser, q: ListOrdersQuery) {
    const and: Prisma.OrderWhereInput[] = [this.visibilityFilter(user)];
    if (q.siteId) and.push({ siteId: q.siteId });
    if (q.createdById && isPrivileged(user.role)) and.push({ createdById: q.createdById });
    if (q.status) {
      if (!(q.status in ORDER_STATUS_LABELS)) throw new BadRequestException('Nieznany status');
      and.push({ status: q.status as OrderStatus });
    }
    if (q.dateFrom) and.push({ createdAt: { gte: new Date(q.dateFrom) } });
    if (q.dateTo) {
      const end = new Date(q.dateTo);
      end.setUTCDate(end.getUTCDate() + 1);
      and.push({ createdAt: { lt: end } });
    }
    if (q.q?.trim()) {
      const t = q.q.trim();
      and.push({
        OR: [
          { number: { contains: t, mode: 'insensitive' } },
          { site: { name: { contains: t, mode: 'insensitive' } } },
          { items: { some: { name: { contains: t, mode: 'insensitive' } } } },
        ],
      });
    }
    const rows = await this.prisma.order.findMany({
      where: { AND: and },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        number: true,
        status: true,
        siteId: true,
        createdById: true,
        createdAt: true,
        submittedAt: true,
        site: { select: { name: true, address: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      statusLabel: ORDER_STATUS_LABELS[r.status as OrderStatusKey],
      siteId: r.siteId,
      siteName: r.site.name,
      address: r.site.address,
      createdById: r.createdById,
      createdByName: fullName(r.createdBy),
      createdAt: r.createdAt,
      submittedAt: r.submittedAt,
      itemCount: r._count.items,
    }));
  }

  private async loadOrder(id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, address: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { orderBy: { position: 'asc' } },
        photos: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' }, include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!o) throw new NotFoundException('Zamówienie nie zostało znalezione');
    return o;
  }

  /** Brak dostępu = „nie znaleziono” (nie zdradzamy, że zamówienie istnieje). */
  private assertCanView(user: AuthenticatedUser, o: { createdById: string; status: OrderStatus }) {
    if (o.createdById === user.id) return;
    if (isPrivileged(user.role) && o.status !== 'DRAFT') return;
    throw new NotFoundException('Zamówienie nie zostało znalezione');
  }

  private perms(user: AuthenticatedUser, o: { createdById: string; status: OrderStatus }) {
    return orderPermissions({
      status: o.status as OrderStatusKey,
      isAuthor: o.createdById === user.id,
      privileged: isPrivileged(user.role),
      admin: isAdmin(user.role),
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    return this.toDetail(o, user);
  }

  private async photoView(p: { id: string; itemId: string | null; filePath: string; thumbnailPath: string | null; fileName: string }) {
    return {
      id: p.id,
      itemId: p.itemId,
      fileName: p.fileName,
      url: await this.storage.getSignedUrl(p.filePath),
      thumbnailUrl: p.thumbnailPath ? await this.storage.getSignedUrl(p.thumbnailPath) : null,
    };
  }

  private async toDetail(o: Awaited<ReturnType<OrdersService['loadOrder']>>, user: AuthenticatedUser) {
    const photos = await Promise.all(o.photos.map((p) => this.photoView(p)));
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status as OrderStatusKey],
      note: o.note,
      submittedAt: o.submittedAt,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      site: o.site,
      createdBy: { id: o.createdBy.id, name: fullName(o.createdBy) },
      items: o.items.map((i) => ({
        id: i.id,
        position: i.position,
        catalogItemId: i.catalogItemId,
        name: i.name,
        spec: i.spec,
        quantity: i.quantity,
        unit: i.unit,
        note: i.note,
        isCustom: i.isCustom,
        photos: photos.filter((p) => p.itemId === i.id),
      })),
      orderPhotos: photos.filter((p) => !p.itemId),
      events: o.events.map((e) => ({
        id: e.id,
        type: e.type,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        message: e.message,
        createdAt: e.createdAt,
        userName: fullName(e.user),
      })),
      permissions: this.perms(user, o),
    };
  }

  // =========================================================================
  // Tworzenie i edycja
  // =========================================================================

  private async verifyCatalogIds(items: NormalizedItem[]): Promise<NormalizedItem[]> {
    const ids = Array.from(new Set(items.map((i) => i.catalogItemId).filter(Boolean) as string[]));
    if (ids.length === 0) return items;
    const found = new Set((await this.prisma.materialCatalogItem.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((x) => x.id));
    return items.map((i) => (i.catalogItemId && !found.has(i.catalogItemId) ? { ...i, catalogItemId: null } : i));
  }

  private itemErrors(items: NormalizedItem[], requireAtLeastOne: boolean) {
    const errors = validateItems(items, { requireAtLeastOne });
    if (errors.length) throw new BadRequestException({ message: errors[0], errors });
  }

  private async addEvent(
    tx: Prisma.TransactionClient | PrismaService,
    orderId: string,
    userId: string,
    type: string,
    extra: { fromStatus?: OrderStatus | null; toStatus?: OrderStatus | null; message?: string | null } = {},
  ) {
    return tx.orderEvent.create({
      data: { orderId, userId, type, fromStatus: extra.fromStatus ?? null, toStatus: extra.toStatus ?? null, message: extra.message ?? null },
    });
  }

  async create(dto: CreateOrderDto, user: AuthenticatedUser) {
    const token = dto.clientToken ? `${user.id}:${dto.clientToken}` : null;
    if (token) {
      const existing = await this.prisma.order.findUnique({ where: { clientToken: token } });
      if (existing) return this.findOne(existing.id, user);
    }
    await this.assertSiteAllowed(user, dto.siteId);
    const items = await this.verifyCatalogIds((dto.items ?? []).map((i) => normalizeItem(i as ItemInput)));
    this.itemErrors(items, false);

    for (let attempt = 0; attempt < 4; attempt++) {
      const year = warsawYear();
      const prefix = `ZAM/${year}/`;
      const nums = await this.prisma.order.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } });
      const number = nextOrderNumber(nums.map((n) => n.number), year);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const o = await tx.order.create({
            data: {
              number,
              siteId: dto.siteId,
              createdById: user.id,
              status: 'DRAFT',
              note: dto.note?.trim() || null,
              clientToken: token,
              items: {
                create: items.map((it, idx) => ({
                  position: idx,
                  catalogItemId: it.catalogItemId,
                  name: it.name,
                  spec: it.spec,
                  quantity: it.quantity,
                  unit: it.unit,
                  note: it.note,
                  isCustom: it.isCustom,
                })),
              },
            },
          });
          await this.addEvent(tx, o.id, user.id, 'CREATED', { toStatus: 'DRAFT', message: 'Utworzono zamówienie (wersja robocza)' });
          return o;
        });
        return this.findOne(created.id, user);
      } catch (err) {
        if ((err as any)?.code === 'P2002') {
          // Ten sam token wysłany równolegle (np. podwójne kliknięcie) → zwracamy już utworzone zamówienie.
          if (token) {
            const existing = await this.prisma.order.findUnique({ where: { clientToken: token } });
            if (existing) return this.findOne(existing.id, user);
          }
          if (attempt < 3) continue;
        }
        throw err;
      }
    }
    throw new ConflictException('Nie udało się nadać numeru zamówienia — spróbuj ponownie');
  }

  async update(id: string, dto: UpdateOrderDto, user: AuthenticatedUser) {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    const perms = this.perms(user, o);
    if (!perms.canEditItems) {
      throw new ForbiddenException(
        o.status === 'DRAFT'
          ? 'To zamówienie może edytować tylko jego autor'
          : 'Zamówienie zostało już wysłane — dopisz komentarz albo poproś administratora o zmianę.',
      );
    }
    const isDraft = o.status === 'DRAFT';

    if (dto.siteId !== undefined && dto.siteId !== o.siteId) {
      if (!isDraft) throw new BadRequestException('Budowy nie można zmienić po wysłaniu zamówienia');
      await this.assertSiteAllowed(user, dto.siteId);
    }

    let items: NormalizedItem[] | undefined;
    if (dto.items !== undefined) {
      items = await this.verifyCatalogIds(dto.items.map((i) => normalizeItem(i as ItemInput)));
      this.itemErrors(items, !isDraft);
      const existingIds = new Set(o.items.map((i) => i.id));
      for (const it of items) {
        if (it.id && !existingIds.has(it.id)) throw new BadRequestException('Nieprawidłowa pozycja zamówienia');
      }
    }

    const removedPhotoKeys: string[] = [];
    const changeLines: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const patch: Prisma.OrderUncheckedUpdateInput = {};
      if (dto.siteId !== undefined && isDraft) patch.siteId = dto.siteId;
      if (dto.note !== undefined) {
        const next = dto.note.trim() || null;
        if ((o.note ?? '') !== (next ?? '') && !isDraft) changeLines.push(`~ Uwagi do zamówienia: „${o.note ?? ''}” → „${next ?? ''}”`);
        patch.note = next;
      }
      if (Object.keys(patch).length) await tx.order.update({ where: { id }, data: patch });

      if (items) {
        const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id as string));
        const toDelete = o.items.filter((i) => !keepIds.has(i.id));
        if (toDelete.length) {
          const ph = await tx.orderPhoto.findMany({ where: { itemId: { in: toDelete.map((d) => d.id) } } });
          for (const p of ph) removedPhotoKeys.push(p.filePath, ...(p.thumbnailPath ? [p.thumbnailPath] : []));
          await tx.orderItem.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } });
        }
        for (const [idx, it] of items.entries()) {
          const data = {
            position: idx,
            catalogItemId: it.catalogItemId,
            name: it.name,
            spec: it.spec,
            quantity: it.quantity,
            unit: it.unit,
            note: it.note,
            isCustom: it.isCustom,
          };
          if (it.id) await tx.orderItem.update({ where: { id: it.id }, data });
          else await tx.orderItem.create({ data: { ...data, orderId: id } });
        }
        if (!isDraft) {
          const before = o.items.map((i) => ({ id: i.id, name: i.name, spec: i.spec, quantity: i.quantity, unit: i.unit, note: i.note }));
          const after = items.map((i) => ({ id: i.id as string, name: i.name, spec: i.spec, quantity: i.quantity, unit: i.unit, note: i.note }));
          changeLines.push(...diffItems(before, after));
        }
      }

      if (!isDraft && changeLines.length) {
        await this.addEvent(tx, id, user.id, 'EDIT', { message: changeLines.join('\n') });
      }
    });

    await Promise.all(removedPhotoKeys.map((k) => this.storage.delete(k).catch(() => undefined)));

    if (!isDraft && changeLines.length && o.createdById !== user.id) {
      await this.safeNotify([o.createdById], {
        type: 'ORDER_STATUS_CHANGED',
        title: `Zmiana w zamówieniu ${o.number}`,
        message: `Administrator zmienił pozycje zamówienia (${o.site.name}).`,
        entityId: id,
      });
    }
    return this.findOne(id, user);
  }

  // =========================================================================
  // Wysyłanie, statusy, komentarze
  // =========================================================================

  private async privilegedIds(excludeUserId?: string) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'KIEROWNIK'] }, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /** Powiadomienia nigdy nie mogą przewrócić operacji na zamówieniu. */
  private async safeNotify(userIds: string[], input: { type: 'ORDER_SUBMITTED' | 'ORDER_STATUS_CHANGED' | 'ORDER_COMMENT'; title: string; message: string; entityId: string }) {
    try {
      if (userIds.length === 0) return;
      await this.notifications.notifyUsers(userIds, { type: input.type as any, title: input.title, message: input.message, entityType: 'Order', entityId: input.entityId });
    } catch (err) {
      this.logger.warn(`Powiadomienie o zamówieniu nie zostało wysłane: ${(err as Error).message}`);
    }
  }

  async submit(id: string, user: AuthenticatedUser) {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    if (o.createdById !== user.id) throw new ForbiddenException('Zamówienie może wysłać tylko jego autor');
    // Idempotentnie: drugie kliknięcie / ponowienie żądania nie wysyła zamówienia drugi raz.
    if (o.status !== 'DRAFT') return this.toDetail(o, user);

    await this.assertSiteAllowed(user, o.siteId);
    const items = o.items.map((i) => normalizeItem({ id: i.id, name: i.name, spec: i.spec, quantity: i.quantity, unit: i.unit, note: i.note, isCustom: i.isCustom }));
    this.itemErrors(items, true);

    const res = await this.prisma.order.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'SENT', submittedAt: new Date() } });
    if (res.count === 0) return this.findOne(id, user); // ktoś był pierwszy
    await this.addEvent(this.prisma, id, user.id, 'SUBMITTED', { fromStatus: 'DRAFT', toStatus: 'SENT', message: 'Zamówienie wysłane do administratora' });

    await this.safeNotify(await this.privilegedIds(user.id), {
      type: 'ORDER_SUBMITTED',
      title: `Nowe zamówienie ${o.number}`,
      message: `${fullName(o.createdBy)} — ${o.site.name} (${o.items.length} poz.)`,
      entityId: id,
    });
    return this.findOne(id, user);
  }

  async changeStatus(id: string, dto: ChangeStatusDto, user: AuthenticatedUser) {
    if (!isPrivileged(user.role)) throw new ForbiddenException('Status zamówienia zmienia administrator lub brygadzista');
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    if (!(dto.status in ORDER_STATUS_LABELS)) throw new BadRequestException('Nieznany status');
    if (o.status === 'DRAFT') throw new BadRequestException('Zamówienie jest wersją roboczą — autor musi je najpierw wysłać');
    if (dto.status === 'DRAFT') throw new BadRequestException('Nie można cofnąć wysłanego zamówienia do wersji roboczej');
    if (dto.status === o.status) return this.toDetail(o, user);

    const target = dto.status as OrderStatus;
    const res = await this.prisma.order.updateMany({ where: { id, status: o.status }, data: { status: target } });
    if (res.count === 0) throw new ConflictException('Status zamówienia zmienił się w międzyczasie — odśwież stronę');
    await this.addEvent(this.prisma, id, user.id, 'STATUS', {
      fromStatus: o.status,
      toStatus: target,
      message: dto.comment?.trim() || null,
    });

    if (o.createdById !== user.id) {
      await this.safeNotify([o.createdById], {
        type: 'ORDER_STATUS_CHANGED',
        title: `Zamówienie ${o.number}: ${ORDER_STATUS_LABELS[target as OrderStatusKey]}`,
        message: dto.comment?.trim() || `Nowy status zamówienia dla budowy ${o.site.name}.`,
        entityId: id,
      });
    }
    return this.findOne(id, user);
  }

  async addComment(id: string, message: string, user: AuthenticatedUser) {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    if (!this.perms(user, o).canComment) throw new BadRequestException('Komentarze są dostępne po wysłaniu zamówienia');
    const text = message.trim();
    if (!text) throw new BadRequestException('Komentarz jest pusty');
    await this.addEvent(this.prisma, id, user.id, 'COMMENT', { message: text });

    const recipients = o.createdById === user.id ? await this.privilegedIds(user.id) : [o.createdById];
    await this.safeNotify(recipients, {
      type: 'ORDER_COMMENT',
      title: `Komentarz do zamówienia ${o.number}`,
      message: text.length > 140 ? `${text.slice(0, 137)}…` : text,
      entityId: id,
    });
    return this.findOne(id, user);
  }

  async remove(id: string, user: AuthenticatedUser) {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    if (!this.perms(user, o).canDelete) throw new ForbiddenException('Usunąć można tylko własną wersję roboczą');
    const keys = o.photos.flatMap((p) => [p.filePath, ...(p.thumbnailPath ? [p.thumbnailPath] : [])]);
    await this.prisma.order.delete({ where: { id } });
    await Promise.all(keys.map((k) => this.storage.delete(k).catch(() => undefined)));
    return { ok: true };
  }

  // =========================================================================
  // Zdjęcia
  // =========================================================================

  async addPhoto(id: string, dto: UploadOrderPhotoDto, user: AuthenticatedUser) {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    if (!this.perms(user, o).canAddPhotos) throw new ForbiddenException('Nie możesz dodawać zdjęć do tego zamówienia');
    if (dto.itemId && !o.items.some((i) => i.id === dto.itemId)) throw new BadRequestException('Nieprawidłowa pozycja zamówienia');
    if (o.photos.length >= MAX_PHOTOS_PER_ORDER) throw new BadRequestException(`Maksymalnie ${MAX_PHOTOS_PER_ORDER} zdjęć w jednym zamówieniu`);

    const raw = Buffer.from(dto.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (raw.length === 0) throw new BadRequestException('Pusty plik');
    if (raw.length > MAX_PHOTO_BYTES) throw new PayloadTooLargeException('Zdjęcie jest za duże (maks. 10 MB)');

    // Typ pliku weryfikujemy po zawartości (nie po rozszerzeniu ani deklarowanym typie)
    let format: string | undefined;
    try {
      format = (await sharp(raw).metadata()).format;
    } catch {
      format = undefined;
    }
    if (!format || !ALLOWED_IMAGE_FORMATS.has(format)) throw new BadRequestException('Dozwolone są tylko zdjęcia JPG, PNG lub WebP');

    // Normalizacja: poprawna orientacja, maks. 2000 px, JPEG — lekkie pliki także przy słabym łączu
    const jpg = await sharp(raw).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    const saved = await this.storage.savePhotoWithThumbnail(jpg, 'foto.jpg', `orders/${id}`);
    const baseName = (dto.fileName || 'foto').replace(/\.[^.]+$/, '').replace(/[^\w.\- ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+/g, '_').slice(0, 80) || 'foto';

    const photo = await this.prisma.orderPhoto.create({
      data: {
        orderId: id,
        itemId: dto.itemId ?? null,
        filePath: saved.fullResPath,
        thumbnailPath: saved.thumbnailPath,
        fileName: `${baseName}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: jpg.length,
        uploadedById: user.id,
      },
    });
    if (o.status !== 'DRAFT') {
      await this.addEvent(this.prisma, id, user.id, 'EDIT', { message: `+ Dodano zdjęcie: ${photo.fileName}` });
    }
    return this.photoView(photo);
  }

  async removePhoto(id: string, photoId: string, user: AuthenticatedUser) {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    if (!this.perms(user, o).canAddPhotos) throw new ForbiddenException('Nie możesz usuwać zdjęć z tego zamówienia');
    const p = o.photos.find((x) => x.id === photoId);
    if (!p) throw new NotFoundException('Zdjęcie nie zostało znalezione');
    await this.prisma.orderPhoto.delete({ where: { id: photoId } });
    await this.storage.delete(p.filePath).catch(() => undefined);
    if (p.thumbnailPath) await this.storage.delete(p.thumbnailPath).catch(() => undefined);
    if (o.status !== 'DRAFT') await this.addEvent(this.prisma, id, user.id, 'EDIT', { message: `− Usunięto zdjęcie: ${p.fileName}` });
    return { ok: true };
  }

  // =========================================================================
  // Wydruk dla hurtowni (PDF A4)
  // =========================================================================

  private logoPath(): string | null {
    const candidates = [
      process.env.PROTOCOL_LOGO_PATH,
      path.join(process.cwd(), 'assets', 'logo.png'),
      path.resolve(__dirname, '../../../assets/logo.png'),
    ].filter(Boolean) as string[];
    return candidates.find((c) => fs.existsSync(c)) ?? null;
  }

  private async readStream(key: string): Promise<Buffer> {
    const stream = await this.storage.getObjectStream(key);
    const chunks: Buffer[] = [];
    for await (const c of stream as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks);
  }

  async buildPdfInput(id: string, user: AuthenticatedUser, includePhotos: boolean): Promise<OrderPdfInput> {
    const o = await this.loadOrder(id);
    this.assertCanView(user, o);
    if (!this.perms(user, o).canPrint) throw new ForbiddenException('Listę dla hurtowni drukuje administrator lub brygadzista');

    const photos: OrderPdfInput['photos'] = [];
    if (includePhotos) {
      for (const p of o.photos.slice(0, MAX_PDF_PHOTOS)) {
        try {
          const raw = await this.readStream(p.filePath);
          const jpg = await sharp(raw).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 75 }).toBuffer();
          const idx = p.itemId ? o.items.findIndex((i) => i.id === p.itemId) : -1;
          const caption = idx >= 0 ? `Poz. ${idx + 1}: ${o.items[idx].name}` : 'Zdjęcie do całego zamówienia';
          photos.push({ caption, bytes: jpg });
        } catch (err) {
          this.logger.warn(`Pominięto zdjęcie ${p.id} w PDF: ${(err as Error).message}`);
        }
      }
    }

    return {
      number: o.number,
      siteName: o.site.name,
      address: o.site.address ?? '',
      author: fullName(o.createdBy),
      dateLabel: new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(o.submittedAt ?? o.createdAt),
      statusLabel: ORDER_STATUS_LABELS[o.status as OrderStatusKey],
      note: o.note ?? '',
      items: o.items.map((i) => ({ name: i.name, spec: i.spec ?? '', quantity: i.quantity, unit: i.unit, note: i.note ?? '' })),
      photos,
      generatedAt: new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
      logoPath: this.logoPath(),
    };
  }

  async print(id: string, dto: PrintOrderDto, user: AuthenticatedUser) {
    const input = await this.buildPdfInput(id, user, !!dto.includePhotos);
    const key = `orders/${id}/print-${Date.now()}.pdf`;
    await this.pdf.render(input, key);
    return { pdfUrl: await this.storage.getSignedUrl(key), fileName: orderPdfFileName(input.number, input.siteName) };
  }
}
