import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FileStorageService } from '../../../common/storage/file-storage.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { parseDateOnly, warsawToday } from '../protocols/protocol-logic';
import {
  DEFAULT_SIMPLE_ITEMS,
  SimpleItem,
  fileSafe,
  nextSimpleNumber,
  normalizeExternal,
  normalizeSimpleItems,
} from './simple-protocol.logic';
import { CreateSimpleProtocolDto, SimpleListQuery, UpdateSimpleProtocolDto, UploadSimplePhotoDto } from './dto/simple-protocol.dto';
import { SimpleProtocolPdfService } from './simple-protocol-pdf.service';

const isPrivileged = (role: string) => role === 'ADMIN' || role === 'KIEROWNIK';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 60;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

const fmtYmd = (d: Date) => d.toISOString().slice(0, 10);
const fullName = (u: { firstName: string; lastName: string } | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');

@Injectable()
export class SimpleProtocolService {
  private readonly logger = new Logger(SimpleProtocolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly pdf: SimpleProtocolPdfService,
  ) {}

  defaults() {
    return { items: DEFAULT_SIMPLE_ITEMS };
  }

  // ------------------------------------------------------------------ dostęp

  private async isAssigned(userId: string, siteId: string | null) {
    if (!siteId) return false;
    return !!(await this.prisma.siteAssignee.findFirst({ where: { siteId, userId }, select: { id: true } }));
  }

  private async assertCanView(user: AuthenticatedUser, p: { createdById: string; siteId: string | null }) {
    if (isPrivileged(user.role) || p.createdById === user.id) return;
    if (await this.isAssigned(user.id, p.siteId)) return;
    // „Nie znaleziono” zamiast „brak dostępu” — nie zdradzamy istnienia cudzego dokumentu
    throw new NotFoundException('Protokół nie został znaleziony');
  }

  private canEdit(user: AuthenticatedUser, p: { createdById: string }) {
    return isPrivileged(user.role) || p.createdById === user.id;
  }

  private async companyName(): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'company.name' } }).catch(() => null);
    return row?.value || 'P-Troy';
  }

  // ------------------------------------------------------------------ odczyt

  private async load(id: string) {
    const p = await this.prisma.simpleProtocol.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, address: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        photos: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    return p;
  }

  private siteView(p: { site: { id: string; name: string; address: string | null } | null; externalSite: unknown }) {
    if (p.site) return { source: 'SITE' as const, siteId: p.site.id, name: p.site.name, address: p.site.address ?? '', investor: '', contactPerson: '', phone: '' };
    const e = normalizeExternal(p.externalSite as any);
    return { source: 'EXTERNAL' as const, siteId: null as string | null, ...e };
  }

  private async toDetail(p: Awaited<ReturnType<SimpleProtocolService['load']>>, user: AuthenticatedUser) {
    const photos = await Promise.all(
      p.photos.map(async (ph) => ({
        id: ph.id,
        fileName: ph.fileName,
        url: await this.storage.getSignedUrl(ph.filePath),
        thumbnailUrl: ph.thumbnailPath ? await this.storage.getSignedUrl(ph.thumbnailPath) : null,
      })),
    );
    return {
      id: p.id,
      number: p.number,
      name: p.name,
      performedAt: fmtYmd(p.performedAt),
      description: p.description,
      items: ((p.items as unknown as SimpleItem[]) ?? []).map((i) => ({ name: i.name, quantity: i.quantity, custom: !!i.custom })),
      site: this.siteView(p),
      createdBy: { id: p.createdBy.id, name: fullName(p.createdBy) },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      photos,
      defaults: DEFAULT_SIMPLE_ITEMS,
      permissions: { canEdit: this.canEdit(user, p), canDelete: user.role === 'ADMIN', canPrint: true },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const p = await this.load(id);
    await this.assertCanView(user, p);
    return this.toDetail(p, user);
  }

  async list(user: AuthenticatedUser, q: SimpleListQuery) {
    const and: Prisma.SimpleProtocolWhereInput[] = [];
    if (!isPrivileged(user.role)) and.push({ OR: [{ createdById: user.id }, { site: { assignees: { some: { userId: user.id } } } }] });
    if (q.siteId) and.push({ siteId: q.siteId });
    if (q.dateFrom) and.push({ performedAt: { gte: parseDateOnly(q.dateFrom) ?? undefined } });
    if (q.dateTo) and.push({ performedAt: { lte: parseDateOnly(q.dateTo) ?? undefined } });
    if (q.q?.trim()) {
      const t = q.q.trim();
      and.push({ OR: [{ number: { contains: t, mode: 'insensitive' } }, { name: { contains: t, mode: 'insensitive' } }, { site: { name: { contains: t, mode: 'insensitive' } } }] });
    }
    const rows = await this.prisma.simpleProtocol.findMany({
      where: { AND: and },
      orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: {
        site: { select: { id: true, name: true, address: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { photos: true } },
      },
    });
    return rows.map((r) => {
      const site = this.siteView(r);
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        performedAt: fmtYmd(r.performedAt),
        siteName: site.name,
        address: site.address,
        authorName: fullName(r.createdBy),
        itemCount: Array.isArray(r.items) ? (r.items as unknown[]).length : 0,
        photoCount: r._count.photos,
      };
    });
  }

  // ------------------------------------------------------------------ zapis

  private itemsOrThrow(raw: any[] | undefined) {
    const { items, errors } = normalizeSimpleItems(raw);
    if (errors.length) throw new BadRequestException({ message: errors[0], errors });
    return items;
  }

  /** Wspólne ustalenie budynku: z bazy (z kontrolą przypisania) albo zewnętrzny (wymaga nazwy). */
  private async resolveSite(user: AuthenticatedUser, dto: { siteId?: string; externalSite?: Record<string, any> }, current?: { siteId: string | null }) {
    if (dto.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: dto.siteId }, select: { id: true, name: true } });
      if (!site) throw new BadRequestException('Wybrany budynek nie istnieje');
      if (dto.siteId !== current?.siteId && !isPrivileged(user.role) && !(await this.isAssigned(user.id, dto.siteId))) {
        throw new ForbiddenException('Nie jesteś przypisany do tej budowy');
      }
      return { siteId: dto.siteId, externalSite: null as Record<string, string> | null, siteName: site.name };
    }
    if (dto.externalSite) {
      const ext = normalizeExternal(dto.externalSite);
      if (!ext.name) throw new BadRequestException('Podaj nazwę budynku (budynek zewnętrzny)');
      return { siteId: null as string | null, externalSite: ext, siteName: ext.name };
    }
    return null;
  }

  async create(dto: CreateSimpleProtocolDto, user: AuthenticatedUser) {
    const token = dto.clientToken ? `${user.id}:${dto.clientToken}` : null;
    if (token) {
      const existing = await this.prisma.simpleProtocol.findUnique({ where: { clientToken: token } });
      if (existing) return this.findOne(existing.id, user);
    }
    const site = await this.resolveSite(user, dto);
    if (!site) throw new BadRequestException('Wybierz budynek z bazy albo wpisz dane budynku zewnętrznego');
    const items = this.itemsOrThrow(dto.items);
    const performedAt = dto.performedAt ? parseDateOnly(dto.performedAt) : parseDateOnly(warsawToday());
    if (!performedAt) throw new BadRequestException('Nieprawidłowa data wykonania');
    const name = dto.name?.trim() || `Protokół prac — ${site.siteName}`;

    for (let attempt = 0; attempt < 4; attempt++) {
      const year = new Date(`${warsawToday()}T00:00:00Z`).getUTCFullYear();
      const nums = await this.prisma.simpleProtocol.findMany({ where: { number: { startsWith: `PRP/${year}/` } }, select: { number: true } });
      const number = nextSimpleNumber(nums.map((n) => n.number), year);
      try {
        const created = await this.prisma.simpleProtocol.create({
          data: {
            number,
            name,
            siteId: site.siteId,
            externalSite: site.externalSite ?? Prisma.DbNull,
            performedAt,
            description: dto.description ?? '',
            items: items as unknown as Prisma.InputJsonValue,
            createdById: user.id,
            clientToken: token,
          },
        });
        return this.findOne(created.id, user);
      } catch (err) {
        if ((err as any)?.code === 'P2002') {
          if (token) {
            const existing = await this.prisma.simpleProtocol.findUnique({ where: { clientToken: token } });
            if (existing) return this.findOne(existing.id, user);
          }
          if (attempt < 3) continue;
        }
        throw err;
      }
    }
    throw new ConflictException('Nie udało się nadać numeru protokołu — spróbuj ponownie');
  }

  async update(id: string, dto: UpdateSimpleProtocolDto, user: AuthenticatedUser) {
    const p = await this.load(id);
    await this.assertCanView(user, p);
    if (!this.canEdit(user, p)) throw new ForbiddenException('Możesz edytować wyłącznie własne protokoły');

    const data: Prisma.SimpleProtocolUncheckedUpdateInput = {};
    if (dto.siteId || dto.externalSite) {
      const site = await this.resolveSite(user, dto, p);
      if (site) {
        data.siteId = site.siteId;
        data.externalSite = site.externalSite ?? Prisma.DbNull;
      }
    }
    if (dto.name !== undefined) data.name = dto.name.trim() || p.name;
    if (dto.performedAt !== undefined) {
      const d = parseDateOnly(dto.performedAt);
      if (!d) throw new BadRequestException('Nieprawidłowa data wykonania');
      data.performedAt = d;
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.items !== undefined) data.items = this.itemsOrThrow(dto.items) as unknown as Prisma.InputJsonValue;
    if (Object.keys(data).length) await this.prisma.simpleProtocol.update({ where: { id }, data });
    return this.findOne(id, user);
  }

  async remove(id: string, user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Protokół może usunąć tylko administrator');
    const p = await this.load(id);
    const keys = p.photos.flatMap((ph) => [ph.filePath, ...(ph.thumbnailPath ? [ph.thumbnailPath] : [])]);
    await this.prisma.simpleProtocol.delete({ where: { id } });
    await Promise.all(keys.map((k) => this.storage.delete(k).catch(() => undefined)));
    return { ok: true };
  }

  // ------------------------------------------------------------------ zdjęcia

  async addPhoto(id: string, dto: UploadSimplePhotoDto, user: AuthenticatedUser) {
    const p = await this.load(id);
    await this.assertCanView(user, p);
    if (!this.canEdit(user, p)) throw new ForbiddenException('Możesz dodawać zdjęcia wyłącznie do własnych protokołów');
    if (p.photos.length >= MAX_PHOTOS) throw new BadRequestException(`Maksymalnie ${MAX_PHOTOS} zdjęć w jednym protokole`);

    const raw = Buffer.from(dto.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (raw.length === 0) throw new BadRequestException('Pusty plik');
    if (raw.length > MAX_PHOTO_BYTES) throw new PayloadTooLargeException('Zdjęcie jest za duże (maks. 10 MB)');
    let format: string | undefined;
    try { format = (await sharp(raw).metadata()).format; } catch { format = undefined; }
    if (!format || !ALLOWED_FORMATS.has(format)) throw new BadRequestException('Dozwolone są tylko zdjęcia JPG, PNG lub WebP');

    const jpg = await sharp(raw).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    const saved = await this.storage.savePhotoWithThumbnail(jpg, 'foto.jpg', `simple-protocols/${id}`);
    const base = (dto.fileName || 'foto').replace(/\.[^.]+$/, '').replace(/[^\w.\- ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+/g, '_').slice(0, 80) || 'foto';
    const photo = await this.prisma.simpleProtocolPhoto.create({
      data: { protocolId: id, filePath: saved.fullResPath, thumbnailPath: saved.thumbnailPath, fileName: `${base}.jpg`, sizeBytes: jpg.length, uploadedById: user.id },
    });
    return {
      id: photo.id,
      fileName: photo.fileName,
      url: await this.storage.getSignedUrl(photo.filePath),
      thumbnailUrl: photo.thumbnailPath ? await this.storage.getSignedUrl(photo.thumbnailPath) : null,
    };
  }

  async removePhoto(id: string, photoId: string, user: AuthenticatedUser) {
    const p = await this.load(id);
    await this.assertCanView(user, p);
    if (!this.canEdit(user, p)) throw new ForbiddenException('Możesz usuwać zdjęcia wyłącznie z własnych protokołów');
    const ph = p.photos.find((x) => x.id === photoId);
    if (!ph) throw new NotFoundException('Zdjęcie nie zostało znalezione');
    await this.prisma.simpleProtocolPhoto.delete({ where: { id: photoId } });
    await this.storage.delete(ph.filePath).catch(() => undefined);
    if (ph.thumbnailPath) await this.storage.delete(ph.thumbnailPath).catch(() => undefined);
    return { ok: true };
  }

  // ------------------------------------------------------------------ PDF

  private logoPath(): string | null {
    const candidates = [process.env.PROTOCOL_LOGO_PATH, path.join(process.cwd(), 'assets', 'logo.png'), path.resolve(__dirname, '../../../../assets/logo.png')].filter(Boolean) as string[];
    return candidates.find((c) => fs.existsSync(c)) ?? null;
  }

  private async readStream(key: string): Promise<Buffer> {
    const stream = await this.storage.getObjectStream(key);
    const chunks: Buffer[] = [];
    for await (const c of stream as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks);
  }

  async print(id: string, user: AuthenticatedUser) {
    const p = await this.load(id);
    await this.assertCanView(user, p);
    const site = this.siteView(p);
    const photos: { bytes: Uint8Array }[] = [];
    for (const ph of p.photos) {
      try {
        const raw = await this.readStream(ph.filePath);
        photos.push({ bytes: await sharp(raw).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer() });
      } catch (err) {
        this.logger.warn(`Pominięto zdjęcie ${ph.id} w PDF: ${(err as Error).message}`);
      }
    }
    const input = {
      company: await this.companyName(),
      number: p.number,
      name: p.name,
      site: { name: site.name ?? '', address: site.address ?? '', investor: site.investor ?? '', contactPerson: site.contactPerson ?? '', phone: site.phone ?? '' },
      performedAt: fmtYmd(p.performedAt),
      author: fullName(p.createdBy),
      description: p.description,
      items: ((p.items as unknown as SimpleItem[]) ?? []).filter((i) => i.quantity > 0),
      photos,
      generatedAt: new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
      logoPath: this.logoPath(),
    };
    const key = `simple-protocols/${id}/print-${Date.now()}.pdf`;
    await this.pdf.render(input, key);
    return { pdfUrl: await this.storage.getSignedUrl(key), fileName: `${fileSafe(p.number.replace(/\//g, '-'))}_${fileSafe(p.name)}.pdf` };
  }
}
