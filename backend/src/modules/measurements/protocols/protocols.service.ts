import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FileStorageService } from '../../../common/storage/file-storage.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import {
  BUILTIN_SECTIONS,
  SectionDef,
  ColumnDef,
  INSPECTION_ITEMS,
  BONDING_ITEMS,
  LIGHTNING_ITEMS,
  EXTRAS_FLAGS,
  FINAL_RATINGS,
  DEFECT_STATUSES,
  DEFECT_SEVERITIES,
  NET_SYSTEMS,
  OBJECT_TYPE_LABELS,
  INSPECTION_KIND_LABELS,
  STATUS_LABELS,
  RATING_OPTIONS,
} from './protocol-schema';
import {
  CalcConfig,
  applyLoopCalc,
  copyStructure,
  daysUntil,
  deadlineBand,
  displayStatus,
  formatPlDate,
  newId,
  nextProtocolNumber,
  parseDateOnly,
  pdfFileName,
  printableSections,
  reminderMessage,
  reminderToSend,
  toDateOnly,
  validateForApproval,
  warsawToday,
  parseNum,
  mergedSections,
} from './protocol-logic';
import { ProtocolPdfService, ProtocolPdfInput, PdfImage, PdfSignature } from './protocol-pdf.service';
import {
  CreateProtocolDto,
  UpdateProtocolDto,
  SignProtocolDto,
  UploadAttachmentDto,
  PrintProtocolDto,
  ImportBoardDto,
  CalcConfigDto,
  SectionDefinitionDto,
  UpdateSectionDefinitionDto,
  FieldDefinitionDto,
  UpdateFieldDefinitionDto,
  FIELD_TYPES,
} from './dto/protocol.dto';

const CALC_SETTING_KEY = 'protocols.calc';
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_PDF_IMAGES = 100;
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const isPrivileged = (role: Role | string) => role === 'ADMIN' || role === 'KIEROWNIK';
const isAdmin = (role: Role | string) => role === 'ADMIN';

type AnyData = Record<string, any>;

@Injectable()
export class ProtocolsService implements OnModuleInit {
  private readonly logger = new Logger(ProtocolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly notifications: NotificationsService,
    private readonly pdf: ProtocolPdfService,
  ) {}

  /**
   * Kafelek „Pomiary” → „Protokoły” (klucz modułu zostaje „measurements”, więc uprawnienia
   * nadane wcześniej nadal działają) + status starych pomiarów. ZAWSZE w try/catch —
   * niezłapany wyjątek w onModuleInit wywala całą aplikację.
   */
  async onModuleInit() {
    try {
      const tile = await this.prisma.dashboardModule.findUnique({ where: { key: 'measurements' } });
      if (tile) {
        const patch: Record<string, string> = {};
        if (tile.name === 'Pomiary') patch.name = 'Protokoły';
        if (tile.route === '/measurements') patch.route = '/protocols';
        if (Object.keys(patch).length) {
          await this.prisma.dashboardModule.update({ where: { key: 'measurements' }, data: patch });
          this.logger.log('Kafelek „Pomiary” przemianowano na „Protokoły”');
        }
      }
    } catch (err) {
      this.logger.warn(`Nie udało się zmienić kafelka: ${(err as Error).message}`);
    }
    try {
      // Stare pomiary (numer POM/…) to zakończone dokumenty historyczne, tylko do odczytu.
      const res = await this.prisma.measurement.updateMany({
        where: { number: { startsWith: 'POM/' }, status: 'DRAFT' },
        data: { status: 'COMPLETED' },
      });
      if (res.count) this.logger.log(`Zmigrowano status ${res.count} starych pomiarów`);
    } catch (err) {
      this.logger.warn(`Migracja statusów starych pomiarów nie powiodła się: ${(err as Error).message}`);
    }
  }

  // =========================================================================
  // Schemat, konfiguracja, definicje
  // =========================================================================

  async getSchema() {
    const defs = await this.getDefinitions();
    return {
      sections: [...BUILTIN_SECTIONS, ...defs.customSections],
      customFields: defs.customFields,
      constants: {
        objectTypes: OBJECT_TYPE_LABELS,
        inspectionKinds: INSPECTION_KIND_LABELS,
        statuses: STATUS_LABELS,
        finalRatings: FINAL_RATINGS,
        extrasFlags: EXTRAS_FLAGS,
        defectStatuses: DEFECT_STATUSES,
        defectSeverities: DEFECT_SEVERITIES,
        netSystems: NET_SYSTEMS,
        ratingOptions: RATING_OPTIONS,
        fieldTypes: FIELD_TYPES,
      },
    };
  }

  async getCalcConfig(): Promise<CalcConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: CALC_SETTING_KEY } });
    if (!row) return { u0: null, coefficients: {}, basis: null };
    try {
      const v = JSON.parse(row.value);
      return { u0: v.u0 ?? null, coefficients: v.coefficients ?? {}, basis: v.basis ?? null };
    } catch {
      return { u0: null, coefficients: {}, basis: null };
    }
  }

  async setCalcConfig(dto: CalcConfigDto, user: AuthenticatedUser) {
    if (!isAdmin(user.role)) throw new ForbiddenException('Konfigurację obliczeń ustawia administrator');
    const u0 = dto.u0 === undefined || dto.u0 === null ? null : parseNum(dto.u0);
    if (dto.u0 !== undefined && dto.u0 !== null && (u0 === null || u0 <= 0)) {
      throw new BadRequestException('U0 musi być liczbą większą od zera');
    }
    const coefficients: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(dto.coefficients ?? {})) {
      if (!['B', 'C', 'D', 'K', 'Z'].includes(k)) throw new BadRequestException(`Nieznana charakterystyka: ${k}`);
      if (v === null || v === undefined || (v as any) === '') {
        coefficients[k] = null;
        continue;
      }
      const n = parseNum(v);
      if (n === null || n <= 0) throw new BadRequestException(`Współczynnik ${k} musi być liczbą większą od zera`);
      coefficients[k] = n;
    }
    const value = JSON.stringify({ u0, coefficients, basis: dto.basis?.trim() || null });
    await this.prisma.systemSetting.upsert({
      where: { key: CALC_SETTING_KEY },
      update: { value },
      create: { key: CALC_SETTING_KEY, value },
    });
    return this.getCalcConfig();
  }

  async getDefinitions() {
    const [sections, fields] = await Promise.all([
      this.prisma.protocolSectionDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.protocolFieldDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    const customSections: SectionDef[] = sections.map((s) => this.toSectionDef(s));
    return { customSections, customFields: fields, sectionRows: sections };
  }

  private toSectionDef(s: {
    key: string;
    title: string;
    objectTypes: string[];
    columns: Prisma.JsonValue | null;
    isActive: boolean;
    description?: string | null;
  }): SectionDef & { isActive: boolean; description?: string | null } {
    const columns = Array.isArray(s.columns) ? (s.columns as unknown as ColumnDef[]) : undefined;
    return {
      key: s.key,
      title: s.title,
      kind: columns?.length ? 'table' : 'fields',
      group: 'additional',
      measurement: !!columns?.length,
      objectTypes: s.objectTypes?.length ? (s.objectTypes as any) : undefined,
      columns,
      copy: columns?.length ? 'structure' : 'all',
      addLabel: 'Dodaj pozycję',
      isCustom: true,
      isActive: s.isActive,
      description: s.description,
    };
  }

  private slug(text: string): string {
    return text
      .toLowerCase()
      .replace(/ł/g, 'l')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
  }

  private normalizeColumns(cols: Record<string, any>[] | undefined): ColumnDef[] | null {
    if (!cols?.length) return null;
    const used = new Set<string>();
    return cols.map((c, i) => {
      const label = String(c.label ?? '').trim();
      if (!label) throw new BadRequestException(`Kolumna ${i + 1}: brak nazwy`);
      const type = ['text', 'number', 'date', 'select', 'rating'].includes(c.type) ? c.type : 'text';
      let key = String(c.key ?? '').trim() || `c_${this.slug(label) || i}`;
      while (used.has(key)) key += '_';
      used.add(key);
      const out: ColumnDef = { key, label, type };
      if (c.unit) out.unit = String(c.unit);
      if (type === 'select' && Array.isArray(c.options)) out.options = c.options.map(String);
      if (type === 'rating') out.options = RATING_OPTIONS;
      if (c.isResult) out.isResult = true;
      return out;
    });
  }

  async createSectionDefinition(dto: SectionDefinitionDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const columns = this.normalizeColumns(dto.columns);
    const key = `c_${this.slug(dto.title) || 'sekcja'}_${Date.now().toString(36)}`;
    return this.prisma.protocolSectionDefinition.create({
      data: {
        key,
        title: dto.title.trim(),
        description: dto.description,
        objectTypes: dto.objectTypes ?? [],
        columns: (columns ?? Prisma.DbNull) as any,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateSectionDefinition(id: string, dto: UpdateSectionDefinitionDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const cur = await this.prisma.protocolSectionDefinition.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Sekcja nie istnieje');
    const data: Prisma.ProtocolSectionDefinitionUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.objectTypes !== undefined) data.objectTypes = dto.objectTypes;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.columns !== undefined) data.columns = (this.normalizeColumns(dto.columns) ?? Prisma.DbNull) as any;
    return this.prisma.protocolSectionDefinition.update({ where: { id }, data });
  }

  /** Definicje nie są kasowane — dezaktywacja zachowuje czytelność starych protokołów. */
  async deleteSectionDefinition(id: string, user: AuthenticatedUser) {
    this.assertAdmin(user);
    await this.prisma.protocolSectionDefinition.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  async createFieldDefinition(dto: FieldDefinitionDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const builtin = BUILTIN_SECTIONS.some((s) => s.key === dto.sectionKey);
    const customSec = builtin
      ? null
      : await this.prisma.protocolSectionDefinition.findUnique({ where: { key: dto.sectionKey } });
    if (!builtin && !customSec) throw new BadRequestException('Nieznana sekcja');
    const key = `f_${this.slug(dto.label) || 'pole'}_${Date.now().toString(36)}`;
    let options: any = dto.options ?? null;
    if (dto.type === 'table') options = this.normalizeColumns(options as any) ?? [];
    return this.prisma.protocolFieldDefinition.create({
      data: {
        sectionKey: dto.sectionKey,
        key,
        label: dto.label.trim(),
        type: dto.type,
        unit: dto.unit,
        required: dto.required ?? false,
        hint: dto.hint,
        options: options ?? Prisma.DbNull,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateFieldDefinition(id: string, dto: UpdateFieldDefinitionDto, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const cur = await this.prisma.protocolFieldDefinition.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Pole nie istnieje');
    const data: Prisma.ProtocolFieldDefinitionUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.required !== undefined) data.required = dto.required;
    if (dto.hint !== undefined) data.hint = dto.hint;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.options !== undefined) {
      data.options = (cur.type === 'table' ? this.normalizeColumns(dto.options as any) ?? [] : dto.options) as any;
    }
    return this.prisma.protocolFieldDefinition.update({ where: { id }, data });
  }

  async deleteFieldDefinition(id: string, user: AuthenticatedUser) {
    this.assertAdmin(user);
    await this.prisma.protocolFieldDefinition.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  private assertAdmin(user: AuthenticatedUser) {
    if (!isAdmin(user.role)) throw new ForbiddenException('Tylko administrator może to zrobić');
  }

  private async activeCustom() {
    const d = await this.getDefinitions();
    return {
      sections: d.customSections.filter((s: any) => s.isActive),
      fields: d.customFields.filter((f) => f.isActive),
    };
  }

  // =========================================================================
  // Dostęp
  // =========================================================================

  private async isAssigned(userId: string, siteId: string | null | undefined) {
    if (!siteId) return false;
    const a = await this.prisma.siteAssignee.findFirst({ where: { siteId, userId }, select: { id: true } });
    return !!a;
  }

  private async assertCanView(user: AuthenticatedUser, p: { performedById: string; siteId: string | null }) {
    if (isPrivileged(user.role) || p.performedById === user.id) return;
    if (await this.isAssigned(user.id, p.siteId)) return;
    throw new ForbiddenException('Brak dostępu do tego protokołu');
  }

  private canEditRaw(user: AuthenticatedUser, p: { performedById: string }) {
    return isPrivileged(user.role) || p.performedById === user.id;
  }

  private isLegacy(p: { number: string }) {
    return p.number.startsWith('POM/');
  }

  private assertEditable(user: AuthenticatedUser, p: { performedById: string; number: string; approvedAt: Date | null }) {
    if (this.isLegacy(p)) throw new BadRequestException('Stary pomiar jest dostępny tylko do odczytu');
    if (p.approvedAt) throw new BadRequestException('Zatwierdzony protokół jest dokumentem historycznym i nie można go zmieniać');
    if (!this.canEditRaw(user, p)) throw new ForbiddenException('Możesz edytować wyłącznie własne protokoły');
  }

  // =========================================================================
  // Dane obiektu (budowa z P-Troy / zewnętrzna / migawka)
  // =========================================================================

  private normalizeExternal(ext: Record<string, any> | null | undefined) {
    const s = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
    return {
      source: 'EXTERNAL' as const,
      siteId: null as string | null,
      name: s(ext?.name),
      address: s(ext?.address),
      investor: s(ext?.investor),
      owner: s(ext?.owner),
      administrator: s(ext?.administrator),
      contactPerson: s(ext?.contactPerson),
      phone: s(ext?.phone),
      email: s(ext?.email),
      siteManager: s(ext?.siteManager),
      contractor: s(ext?.contractor),
      additionalInfo: s(ext?.additionalInfo),
    };
  }

  private async companyName(): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'company.name' } }).catch(() => null);
    return row?.value ?? '';
  }

  /** Dane budowy z P-Troy pobierane relacją (bez kopiowania do wielu tabel) — migawka powstaje dopiero przy zatwierdzeniu. */
  private async liveSiteInfo(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      include: { assignees: { include: { user: { select: { firstName: true, lastName: true, role: true } } } } },
    });
    if (!site) return null;
    const managers = site.assignees
      .filter((a) => a.user.role === 'KIEROWNIK')
      .map((a) => `${a.user.firstName} ${a.user.lastName}`);
    return {
      source: 'SITE' as const,
      siteId: site.id,
      name: site.name,
      address: site.address,
      investor: site.investor,
      owner: '',
      administrator: '',
      contactPerson: '',
      phone: '',
      email: '',
      siteManager: managers.join(', '),
      contractor: await this.companyName(),
      additionalInfo: site.description ?? '',
    };
  }

  private async objectInfo(p: {
    siteId: string | null;
    externalSite: Prisma.JsonValue | null;
    siteSnapshot: Prisma.JsonValue | null;
    approvedAt: Date | null;
  }) {
    // Zatwierdzony protokół = dokument historyczny: czytamy migawkę, nie aktualną budowę.
    if (p.approvedAt && p.siteSnapshot) return p.siteSnapshot as unknown as ReturnType<ProtocolsService['normalizeExternal']>;
    if (p.siteId) {
      const live = await this.liveSiteInfo(p.siteId);
      if (live) return live;
    }
    return this.normalizeExternal(p.externalSite as any);
  }

  // =========================================================================
  // Dane początkowe, normalizacja
  // =========================================================================

  private defaultChecklist(labels: string[], prefix: string) {
    return labels.map((label, i) => ({ key: `${prefix}${i + 1}`, label, state: null, note: '' }));
  }

  private initialData(): AnyData {
    return {
      inspection: { items: this.defaultChecklist(INSPECTION_ITEMS, 'i') },
      bonding: { items: this.defaultChecklist(BONDING_ITEMS, 'b') },
      lightning: { present: false, items: this.defaultChecklist(LIGHTNING_ITEMS, 'l'), earthingResistance: '', notes: '' },
    };
  }

  private fillDefaults(data: AnyData): AnyData {
    const base = this.initialData();
    const out = { ...data };
    for (const k of Object.keys(base)) {
      if (!out[k]) out[k] = base[k];
      else if (!Array.isArray(out[k].items) || out[k].items.length === 0) out[k] = { ...base[k], ...out[k], items: base[k].items };
    }
    return out;
  }

  /** Nadaje id wierszom tabel i przelicza kolumny wyliczane (Ia, wymagane Zs) — tylko ze współczynników admina. */
  private normalizeData(data: AnyData, cfg: CalcConfig, customSections: SectionDef[]): AnyData {
    const out: AnyData = { ...data };
    const ensureIds = (rows: any) =>
      Array.isArray(rows)
        ? rows.filter((r) => r && typeof r === 'object').map((r) => ({ ...r, id: r.id || newId() }))
        : [];
    for (const def of BUILTIN_SECTIONS) {
      if (def.kind === 'table' && out[def.key] !== undefined) out[def.key] = ensureIds(out[def.key]);
    }
    if (Array.isArray(out.loop)) out.loop = applyLoopCalc(out.loop, cfg);
    if (out.custom && typeof out.custom === 'object') {
      const custom: AnyData = { ...out.custom };
      for (const [k, block] of Object.entries<any>(custom)) {
        if (block && Array.isArray(block.rows)) custom[k] = { ...block, rows: ensureIds(block.rows) };
      }
      out.custom = custom;
    }
    void customSections;
    return out;
  }

  // =========================================================================
  // Lista, szczegóły
  // =========================================================================

  private async accessFilter(user: AuthenticatedUser): Promise<Prisma.MeasurementWhereInput> {
    if (isPrivileged(user.role)) return {};
    return {
      OR: [{ performedById: user.id }, { site: { assignees: { some: { userId: user.id } } } }],
    };
  }

  async list(
    user: AuthenticatedUser,
    q: {
      siteId?: string;
      objectType?: string;
      status?: string;
      performerId?: string;
      dateFrom?: string;
      dateTo?: string;
      nextFrom?: string;
      nextTo?: string;
      q?: string;
    },
  ) {
    const and: Prisma.MeasurementWhereInput[] = [await this.accessFilter(user)];
    if (q.siteId) and.push({ siteId: q.siteId });
    if (q.objectType) and.push({ objectType: q.objectType as any });
    if (q.performerId) and.push({ performedById: q.performerId });
    const range = (from?: string, to?: string) => {
      const r: Prisma.DateTimeFilter = {};
      const f = parseDateOnly(from);
      const t = parseDateOnly(to);
      if (f) r.gte = f;
      if (t) r.lte = t;
      return Object.keys(r).length ? r : null;
    };
    const dr = range(q.dateFrom, q.dateTo);
    if (dr) and.push({ performedAt: dr });
    const nr = range(q.nextFrom, q.nextTo);
    if (nr) and.push({ nextInspectionDate: nr });
    if (q.q?.trim()) {
      const t = q.q.trim();
      and.push({
        OR: [
          { number: { contains: t, mode: 'insensitive' } },
          { site: { name: { contains: t, mode: 'insensitive' } } },
          { site: { address: { contains: t, mode: 'insensitive' } } },
          { externalSite: { path: ['name'], string_contains: t } },
          { externalSite: { path: ['address'], string_contains: t } },
        ],
      });
    }

    const rows = await this.prisma.measurement.findMany({
      where: { AND: and },
      select: {
        id: true,
        number: true,
        status: true,
        version: true,
        objectType: true,
        objectTypeName: true,
        inspectionKind: true,
        inspectionKindName: true,
        performedAt: true,
        nextInspectionDate: true,
        deadlineClosedAt: true,
        approvedAt: true,
        siteId: true,
        externalSite: true,
        siteSnapshot: true,
        site: { select: { name: true, address: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
        performerExternal: true,
        updatedAt: true,
      },
      orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    const now = new Date();
    let items = rows.map((r) => {
      const legacy = this.isLegacy(r);
      const snap = r.approvedAt && r.siteSnapshot ? (r.siteSnapshot as any) : null;
      const ext = r.externalSite as any;
      const status = legacy ? 'COMPLETED' : r.status;
      const days = r.nextInspectionDate ? daysUntil(r.nextInspectionDate, now) : null;
      const ds = displayStatus({ status, nextInspectionDate: r.nextInspectionDate, deadlineClosedAt: r.deadlineClosedAt }, now);
      return {
        id: r.id,
        number: r.number,
        isLegacy: legacy,
        version: r.version,
        performedAt: toDateOnly(r.performedAt),
        siteId: r.siteId,
        siteName: snap?.name ?? r.site?.name ?? ext?.name ?? '',
        address: snap?.address ?? r.site?.address ?? ext?.address ?? '',
        isExternal: !r.siteId,
        objectType: r.objectType,
        objectTypeLabel: r.objectType === 'OTHER' && r.objectTypeName ? r.objectTypeName : r.objectType ? OBJECT_TYPE_LABELS[r.objectType] : legacy ? 'Pomiar (stary)' : '',
        inspectionKind: r.inspectionKind,
        inspectionKindLabel:
          r.inspectionKind === 'OTHER' && r.inspectionKindName ? r.inspectionKindName : r.inspectionKind ? INSPECTION_KIND_LABELS[r.inspectionKind] : '',
        performerName: (r.performerExternal as any)?.name || `${r.performedBy.firstName} ${r.performedBy.lastName}`,
        performerId: r.performedBy.id,
        status,
        displayStatus: ds,
        nextInspectionDate: toDateOnly(r.nextInspectionDate),
        daysToNext: days !== null && Number.isFinite(days) ? days : null,
        band: days !== null && Number.isFinite(days) ? deadlineBand(days) : null,
        deadlineClosed: !!r.deadlineClosedAt,
        updatedAt: r.updatedAt,
      };
    });
    if (q.status) items = items.filter((i) => i.displayStatus === q.status);
    return items;
  }

  private async loadFull(id: string) {
    const p = await this.prisma.measurement.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, address: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        attachments: { orderBy: { createdAt: 'asc' } },
        signableDocument: { include: { signatures: true } },
        photos: true,
      },
    });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    return p;
  }

  private async history(p: { id: string; siteId: string | null; previousProtocolId: string | null }) {
    const select = { id: true, number: true, performedAt: true, status: true, version: true, nextInspectionDate: true, approvedAt: true };
    let rows: any[];
    if (p.siteId) {
      rows = await this.prisma.measurement.findMany({ where: { siteId: p.siteId }, select, orderBy: { performedAt: 'desc' }, take: 50 });
    } else {
      // Budowa zewnętrzna: historia = łańcuch „utworzono na podstawie poprzedniego” (wstecz i w przód).
      const seen = new Set<string>([p.id]);
      rows = [];
      let prevId = p.previousProtocolId;
      while (prevId && !seen.has(prevId) && rows.length < 30) {
        const prev = await this.prisma.measurement.findUnique({ where: { id: prevId }, select: { ...select, previousProtocolId: true } });
        if (!prev) break;
        seen.add(prev.id);
        rows.push(prev);
        prevId = prev.previousProtocolId;
      }
      const next = await this.prisma.measurement.findMany({ where: { previousProtocolId: p.id }, select, orderBy: { performedAt: 'desc' } });
      rows = [...next, ...rows];
      const self = await this.prisma.measurement.findUnique({ where: { id: p.id }, select });
      if (self) rows.push(self);
      rows.sort((a, b) => +b.performedAt - +a.performedAt);
    }
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      year: r.performedAt.getUTCFullYear(),
      performedAt: toDateOnly(r.performedAt),
      status: r.status,
      version: r.version,
      nextInspectionDate: toDateOnly(r.nextInspectionDate),
      approved: !!r.approvedAt,
    }));
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const p = await this.loadFull(id);
    await this.assertCanView(user, p);
    return this.toDetail(p, user);
  }

  private async toDetail(p: Awaited<ReturnType<ProtocolsService['loadFull']>>, user: AuthenticatedUser) {
    const legacy = this.isLegacy(p);
    const now = new Date();
    const info = await this.objectInfo(p);
    const days = p.nextInspectionDate ? daysUntil(p.nextInspectionDate, now) : null;
    const status = legacy ? 'COMPLETED' : p.status;

    const attachments = await Promise.all(
      p.attachments.map(async (a) => ({
        id: a.id,
        kind: a.kind,
        fieldKey: a.fieldKey,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt,
        url: await this.storage.getSignedUrl(a.filePath),
        thumbnailUrl: a.thumbnailPath ? await this.storage.getSignedUrl(a.thumbnailPath) : null,
      })),
    );
    const signatures = await Promise.all(
      (p.signableDocument?.signatures ?? []).map(async (s) => ({
        role: s.signerRole === 'INSTALLER' ? 'PERFORMER' : 'REPRESENTATIVE',
        signerName: s.signerName,
        signedAt: s.signedAt,
        imageUrl: await this.storage.getSignedUrl(s.signatureImagePath),
      })),
    );
    const photos = await Promise.all(
      p.photos.map(async (ph) => ({ id: ph.id, url: await this.storage.getSignedUrl(ph.fullResPath), thumbnailUrl: await this.storage.getSignedUrl(ph.thumbnailPath) })),
    );

    const editable = !legacy && !p.approvedAt && this.canEditRaw(user, p);
    return {
      id: p.id,
      number: p.number,
      isLegacy: legacy,
      status,
      displayStatus: displayStatus({ status, nextInspectionDate: p.nextInspectionDate, deadlineClosedAt: p.deadlineClosedAt }, now),
      version: p.version,
      objectType: p.objectType,
      objectTypeName: p.objectTypeName,
      inspectionKind: p.inspectionKind,
      inspectionKindName: p.inspectionKindName,
      performedAt: toDateOnly(p.performedAt),
      startedAt: toDateOnly(p.startedAt),
      finishedAt: toDateOnly(p.finishedAt),
      nextInspectionDate: toDateOnly(p.nextInspectionDate),
      daysToNext: days !== null && Number.isFinite(days) ? days : null,
      band: days !== null && Number.isFinite(days) ? deadlineBand(days) : null,
      deadlineClosedAt: p.deadlineClosedAt,
      siteId: p.siteId,
      site: info,
      externalSite: p.externalSite,
      performer: {
        userId: p.performedBy.id,
        name: `${p.performedBy.firstName} ${p.performedBy.lastName}`,
        phone: p.performedBy.phone,
        email: p.performedBy.email,
      },
      performerExternal: p.performerExternal,
      description: p.description,
      data: p.data ?? null,
      legacy: legacy ? { description: p.description, results: p.results, pdfUrl: p.protocolPdfPath ? await this.storage.getSignedUrl(p.protocolPdfPath) : null } : null,
      photos,
      approvedAt: p.approvedAt,
      approvedBy: p.approvedBy ? { id: p.approvedBy.id, name: `${p.approvedBy.firstName} ${p.approvedBy.lastName}` } : null,
      previousProtocolId: p.previousProtocolId,
      attachments,
      signatures,
      history: await this.history(p),
      lastAutosaveAt: p.lastAutosaveAt,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      pdfUrl: !legacy && p.protocolPdfPath ? await this.storage.getSignedUrl(p.protocolPdfPath) : null,
      permissions: {
        canEdit: editable,
        canApprove: !legacy && !p.approvedAt && isPrivileged(user.role),
        canDelete: !legacy && !p.approvedAt && isAdmin(user.role),
        canEditNextDate: !legacy && this.canEditRaw(user, p),
        canManageDefinitions: isAdmin(user.role),
      },
    };
  }

  // =========================================================================
  // Tworzenie
  // =========================================================================

  private async resolvePerformer(user: AuthenticatedUser, performerUserId?: string) {
    if (!performerUserId || performerUserId === user.id) return user.id;
    if (!isPrivileged(user.role)) throw new ForbiddenException('Instalator może wpisać tylko siebie jako osobę wykonującą');
    const u = await this.prisma.user.findFirst({ where: { id: performerUserId, isActive: true }, select: { id: true } });
    if (!u) throw new BadRequestException('Wybrany użytkownik nie istnieje lub jest nieaktywny');
    return u.id;
  }

  async create(dto: CreateProtocolDto, user: AuthenticatedUser) {
    const prev = dto.previousProtocolId
      ? await this.prisma.measurement.findUnique({ where: { id: dto.previousProtocolId } })
      : null;
    if (dto.previousProtocolId) {
      if (!prev) throw new NotFoundException('Poprzedni protokół nie został znaleziony');
      if (this.isLegacy(prev)) throw new BadRequestException('Nie można tworzyć kopii na podstawie starego pomiaru');
      await this.assertCanView(user, prev);
    }

    let siteId = dto.siteId ?? (prev && !dto.externalSite ? prev.siteId : null) ?? null;
    let externalSite: Record<string, any> | null = dto.externalSite
      ? this.normalizeExternal(dto.externalSite)
      : !dto.siteId && prev?.externalSite
        ? (prev.externalSite as any)
        : null;
    if (dto.externalSite) siteId = dto.siteId ?? null;

    if (!siteId && !externalSite) {
      throw new BadRequestException('Wybierz budowę z P-Troy albo wpisz dane budowy zewnętrznej');
    }

    if (siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
      if (!site) throw new BadRequestException('Wybrana budowa nie istnieje');
      if (!isPrivileged(user.role) && !(await this.isAssigned(user.id, siteId))) {
        throw new ForbiddenException('Nie jesteś przypisany do tej budowy');
      }
      externalSite = null;
    } else if (externalSite && !externalSite.name) {
      throw new BadRequestException('Podaj nazwę obiektu (budowa zewnętrzna)');
    }

    // „Dodaj również tę budowę do bazy P-Troy” — tylko świadomie zaznaczone, tylko przez uprawnionych
    if (!siteId && externalSite && dto.addExternalToSites) {
      if (!isPrivileged(user.role)) throw new ForbiddenException('Budowę do bazy P-Troy może dodać administrator lub brygadzista');
      const created = await this.prisma.site.create({
        data: {
          name: externalSite.name,
          investor: externalSite.investor || externalSite.owner || '—',
          address: externalSite.address || '—',
          description: externalSite.additionalInfo || null,
          createdById: user.id,
        },
      });
      siteId = created.id;
      externalSite = null;
    }

    const performedById = await this.resolvePerformer(user, dto.performerUserId);
    const performerExternal = dto.performerExternal ?? (!dto.performerUserId ? (prev?.performerExternal as any) : null) ?? null;

    const custom = await this.activeCustom();
    const cfg = await this.getCalcConfig();
    let data: AnyData = prev ? copyStructure(prev.data as AnyData, custom.sections) : {};
    data = this.fillDefaults(data);
    data = this.normalizeData(data, cfg, custom.sections);

    // Dane osoby wykonującej do bloku podpisu
    const performerUser = await this.prisma.user.findUnique({ where: { id: performedById }, select: { firstName: true, lastName: true } });
    data.signoff = {
      performer: {
        name: performerExternal?.name ?? `${performerUser?.firstName ?? ''} ${performerUser?.lastName ?? ''}`.trim(),
        qualifications: performerExternal?.qualificationsScope ?? performerExternal?.qualificationsNumber ?? '',
      },
      representative: { name: '' },
    };

    const objectType = dto.objectType ?? prev?.objectType ?? null;
    const year = new Date(`${warsawToday()}T00:00:00Z`).getUTCFullYear();

    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await this.prisma.measurement.findMany({
        where: { number: { startsWith: `PR/${year}/` } },
        select: { number: true },
      });
      const number = nextProtocolNumber(existing.map((e) => e.number), year);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const m = await tx.measurement.create({
            data: {
              number,
              siteId,
              performedById,
              performedAt: parseDateOnly(dto.performedAt) ?? parseDateOnly(warsawToday())!,
              results: {},
              status: 'DRAFT',
              objectType: objectType as any,
              objectTypeName: dto.objectType === 'OTHER' ? dto.objectTypeName?.trim() || null : null,
              inspectionKind: dto.inspectionKind as any,
              inspectionKindName: dto.inspectionKind === 'OTHER' ? dto.inspectionKindName?.trim() || null : null,
              startedAt: parseDateOnly(dto.startedAt),
              finishedAt: parseDateOnly(dto.finishedAt),
              nextInspectionDate: parseDateOnly(dto.nextInspectionDate),
              externalSite: (externalSite ?? Prisma.DbNull) as any,
              performerExternal: (performerExternal ?? Prisma.DbNull) as any,
              data: data as any,
              version: prev ? prev.version + 1 : 1,
              previousProtocolId: prev?.id ?? null,
              lastAutosaveAt: new Date(),
            },
          });
          await tx.signableDocument.create({
            data: {
              type: 'MEASUREMENT_PROTOCOL',
              title: `Protokół ${number}`,
              siteId,
              measurementId: m.id,
              contentSnapshot: { number } as any,
              createdById: user.id,
            },
          });
          return m;
        });
        return this.findOne(created.id, user);
      } catch (err) {
        // Kolizja numeru (dwa protokoły tworzone jednocześnie) — ponawiamy z nowym numerem
        if ((err as any)?.code === 'P2002' && attempt < 3) continue;
        throw err;
      }
    }
    throw new ConflictException('Nie udało się nadać numeru protokołu — spróbuj ponownie');
  }

  // =========================================================================
  // Edycja / autosave
  // =========================================================================

  async update(id: string, dto: UpdateProtocolDto, user: AuthenticatedUser) {
    const p = await this.prisma.measurement.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    await this.assertCanView(user, p);

    if (this.isLegacy(p)) throw new BadRequestException('Stary pomiar jest dostępny tylko do odczytu');
    if (!this.canEditRaw(user, p)) throw new ForbiddenException('Możesz edytować wyłącznie własne protokoły');

    // Zatwierdzony protokół: wolno zmienić wyłącznie termin kolejnego badania
    // (to dane planistyczne, nie treść dokumentu).
    if (p.approvedAt) {
      const keys = Object.keys(dto).filter((k) => (dto as any)[k] !== undefined && k !== 'baseUpdatedAt' && k !== 'autosave');
      if (keys.some((k) => k !== 'nextInspectionDate')) {
        throw new BadRequestException('Zatwierdzony protokół jest dokumentem historycznym — można zmienić tylko termin kolejnego badania');
      }
    }

    if (dto.baseUpdatedAt && new Date(dto.baseUpdatedAt).getTime() !== p.updatedAt.getTime()) {
      throw new ConflictException('Protokół został zmieniony na innym urządzeniu lub w innej karcie. Odśwież stronę, aby nie nadpisać zmian.');
    }

    const patch: Prisma.MeasurementUncheckedUpdateInput = {};

    if (dto.objectType !== undefined) {
      patch.objectType = dto.objectType as any;
      if (dto.objectType !== 'OTHER') patch.objectTypeName = null;
    }
    if (dto.objectTypeName !== undefined) patch.objectTypeName = dto.objectTypeName.trim() || null;
    if (dto.inspectionKind !== undefined) {
      patch.inspectionKind = dto.inspectionKind as any;
      if (dto.inspectionKind !== 'OTHER') patch.inspectionKindName = null;
    }
    if (dto.inspectionKindName !== undefined) patch.inspectionKindName = dto.inspectionKindName.trim() || null;

    const dateField = (name: 'performedAt' | 'startedAt' | 'finishedAt' | 'nextInspectionDate') => {
      if ((dto as any)[name] !== undefined) (patch as any)[name] = parseDateOnly((dto as any)[name]);
    };
    dateField('startedAt');
    dateField('finishedAt');
    dateField('nextInspectionDate');
    if (dto.performedAt !== undefined) {
      const d = parseDateOnly(dto.performedAt);
      if (d) patch.performedAt = d;
    }

    if (dto.status !== undefined) patch.status = dto.status as any;
    if (dto.description !== undefined) patch.description = dto.description;

    if (dto.siteId !== undefined) {
      const site = await this.prisma.site.findUnique({ where: { id: dto.siteId }, select: { id: true } });
      if (!site) throw new BadRequestException('Wybrana budowa nie istnieje');
      if (!isPrivileged(user.role) && !(await this.isAssigned(user.id, dto.siteId))) {
        throw new ForbiddenException('Nie jesteś przypisany do tej budowy');
      }
      patch.siteId = dto.siteId;
      patch.externalSite = Prisma.DbNull as any;
    } else if (dto.externalSite !== undefined) {
      const ext = this.normalizeExternal(dto.externalSite);
      patch.externalSite = ext as any;
      patch.siteId = null;
    }

    if (dto.performerUserId !== undefined) {
      patch.performedById = await this.resolvePerformer(user, dto.performerUserId);
      if (dto.performerExternal === undefined) patch.performerExternal = Prisma.DbNull as any;
    }
    if (dto.performerExternal !== undefined) patch.performerExternal = dto.performerExternal as any;

    let newData: AnyData | null = null;
    if (dto.data !== undefined) {
      const custom = await this.activeCustom();
      const cfg = await this.getCalcConfig();
      newData = this.normalizeData(dto.data, cfg, custom.sections);
      // Daty podpisów ustawia wyłącznie serwer (endpoint /signatures) — klient nie może ich podrobić.
      const cur = (p.data ?? {}) as AnyData;
      const so: AnyData = { ...(newData.signoff ?? {}) };
      for (const role of ['performer', 'representative']) {
        const signedAt = cur.signoff?.[role]?.signedAt;
        so[role] = { ...(so[role] ?? {}) };
        if (signedAt) so[role].signedAt = signedAt;
        else delete so[role].signedAt;
      }
      newData.signoff = so;
      patch.data = newData as any;
      patch.lastAutosaveAt = new Date();
    } else if (dto.autosave) {
      patch.lastAutosaveAt = new Date();
    }

    if (Object.keys(patch).length === 0) return this.findOne(id, user);

    // Zapis warunkowy: jeśli ktoś zmienił protokół między odczytem a zapisem, nie nadpisujemy.
    const res = await this.prisma.measurement.updateMany({
      where: { id, updatedAt: p.updatedAt, ...(p.approvedAt ? {} : { approvedAt: null }) },
      data: patch as any,
    });
    if (res.count === 0) {
      throw new ConflictException('Protokół został zmieniony równolegle. Odśwież stronę, aby nie nadpisać zmian.');
    }
    return this.findOne(id, user);
  }

  // =========================================================================
  // Walidacja i zatwierdzanie
  // =========================================================================

  private async approvalInput(p: Awaited<ReturnType<ProtocolsService['loadFull']>>) {
    const info = await this.objectInfo(p);
    const custom = await this.activeCustom();
    const sigRoles = (p.signableDocument?.signatures ?? []).map((s) => (s.signerRole === 'INSTALLER' ? 'PERFORMER' : 'REPRESENTATIVE'));
    const performerName =
      (p.performerExternal as any)?.name || `${p.performedBy.firstName} ${p.performedBy.lastName}`.trim();
    return {
      performedAt: p.performedAt,
      objectType: p.objectType,
      objectTypeName: p.objectTypeName,
      inspectionKind: p.inspectionKind,
      inspectionKindName: p.inspectionKindName,
      siteName: info.name,
      siteAddress: info.address,
      performerName,
      nextInspectionDate: p.nextInspectionDate,
      data: (p.data ?? {}) as AnyData,
      signatureRoles: sigRoles,
      customSections: custom.sections,
      customFields: custom.fields.map((f) => ({ sectionKey: f.sectionKey, key: f.key, label: f.label, type: f.type, required: f.required })),
    };
  }

  async validate(id: string, user: AuthenticatedUser) {
    const p = await this.loadFull(id);
    await this.assertCanView(user, p);
    if (this.isLegacy(p)) throw new BadRequestException('Stary pomiar — brak walidacji');
    return validateForApproval(await this.approvalInput(p));
  }

  async approve(id: string, user: AuthenticatedUser) {
    if (!isPrivileged(user.role)) throw new ForbiddenException('Protokół zatwierdza administrator lub brygadzista');
    const p = await this.loadFull(id);
    await this.assertCanView(user, p);
    if (this.isLegacy(p)) throw new BadRequestException('Stary pomiar nie podlega zatwierdzaniu');
    if (p.approvedAt) throw new BadRequestException('Protokół jest już zatwierdzony');

    const result = validateForApproval(await this.approvalInput(p));
    if (result.errors.length) {
      throw new BadRequestException({
        message: 'Protokół nie może zostać zatwierdzony — uzupełnij brakujące dane.',
        errors: result.errors,
        warnings: result.warnings,
      });
    }

    const info = await this.objectInfo({ ...p, approvedAt: null });
    const today = warsawToday();
    const data: AnyData = { ...((p.data ?? {}) as AnyData) };
    data.conclusions = { ...(data.conclusions ?? {}), ratingConfirmedAt: today, ratingConfirmedBy: `${user.login}` };

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.measurement.updateMany({
        where: { id, approvedAt: null },
        data: {
          status: 'COMPLETED',
          approvedAt: new Date(),
          approvedById: user.id,
          siteSnapshot: info as any,
          finishedAt: p.finishedAt ?? parseDateOnly(today),
          data: data as any,
          lastAutosaveAt: new Date(),
        },
      });
      if (res.count === 0) throw new ConflictException('Protokół został zatwierdzony równolegle');
      if (p.signableDocument) {
        await tx.signableDocument.update({
          where: { id: p.signableDocument.id },
          data: { isLocked: true, lockedAt: new Date(), contentSnapshot: { number: p.number, version: p.version, data } as any },
        });
      }
      // Nowy protokół „na podstawie poprzedniego” zamyka sprawę terminu poprzedniego.
      if (p.previousProtocolId) {
        await tx.measurement.updateMany({
          where: { id: p.previousProtocolId, deadlineClosedAt: null },
          data: { deadlineClosedAt: new Date() },
        });
      }
    });

    // PDF zatwierdzonego protokołu — niepowodzenie nie cofa zatwierdzenia (PDF można wygenerować ponownie).
    try {
      const fresh = await this.loadFull(id);
      const input = await this.buildPdfInput(fresh, 'FULL', {});
      const key = `protocols/${id}/protokol-v${fresh.version}-${Date.now()}.pdf`;
      await this.pdf.render(input, key);
      await this.prisma.measurement.update({ where: { id }, data: { protocolPdfPath: key } });
    } catch (err) {
      this.logger.warn(`Nie udało się wygenerować PDF po zatwierdzeniu ${p.number}: ${(err as Error).message}`);
    }

    await this.notifications
      .notifyRoles(['ADMIN', 'KIEROWNIK'], {
        type: 'MEASUREMENT_ADDED',
        title: 'Zatwierdzono protokół',
        message: `Protokół ${p.number} — ${info.name}`,
        entityType: 'Measurement',
        entityId: id,
      })
      .catch(() => undefined);

    return { protocol: await this.findOne(id, user), warnings: result.warnings };
  }

  async setDeadlineClosed(id: string, closed: boolean, user: AuthenticatedUser) {
    const p = await this.prisma.measurement.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    await this.assertCanView(user, p);
    if (!this.canEditRaw(user, p)) throw new ForbiddenException('Brak uprawnień');
    await this.prisma.measurement.update({ where: { id }, data: { deadlineClosedAt: closed ? new Date() : null } });
    return this.findOne(id, user);
  }

  async remove(id: string, user: AuthenticatedUser) {
    if (!isAdmin(user.role)) throw new ForbiddenException('Protokół może usunąć tylko administrator');
    const p = await this.loadFull(id);
    if (this.isLegacy(p)) throw new BadRequestException('Starych pomiarów nie można usuwać');
    if (p.approvedAt) throw new BadRequestException('Zatwierdzonego protokołu nie można usunąć — to dokument historyczny');

    const keys = [
      ...p.attachments.flatMap((a) => [a.filePath, a.thumbnailPath].filter(Boolean) as string[]),
      ...(p.signableDocument?.signatures ?? []).map((s) => s.signatureImagePath),
    ];
    await this.prisma.$transaction(async (tx) => {
      if (p.signableDocument) await tx.signableDocument.delete({ where: { id: p.signableDocument.id } });
      await tx.measurement.delete({ where: { id } });
    });
    await Promise.all(keys.map((k) => this.storage.delete(k)));
    return { ok: true };
  }

  // =========================================================================
  // Podpisy
  // =========================================================================

  async sign(id: string, dto: SignProtocolDto, user: AuthenticatedUser, ip: string, userAgent: string) {
    const p = await this.loadFull(id);
    await this.assertCanView(user, p);
    this.assertEditable(user, p);

    const b64 = dto.signatureImageBase64;
    if (!/^data:image\/(png|jpeg);base64,/.test(b64)) throw new BadRequestException('Nieprawidłowy format podpisu');
    if (b64.length > 3_000_000) throw new PayloadTooLargeException('Obraz podpisu jest za duży');

    let doc = p.signableDocument;
    if (!doc) {
      doc = (await this.prisma.signableDocument.create({
        data: { type: 'MEASUREMENT_PROTOCOL', title: `Protokół ${p.number}`, siteId: p.siteId, measurementId: p.id, contentSnapshot: { number: p.number } as any, createdById: user.id },
        include: { signatures: true },
      })) as any;
    }
    const signerRole = dto.role === 'PERFORMER' ? 'INSTALLER' : 'CLIENT';
    const old = doc!.signatures.filter((s) => s.signerRole === signerRole);
    const key = `signatures/${doc!.id}/${dto.role.toLowerCase()}-${Date.now()}.png`;
    await this.storage.saveBase64Image(b64, key);

    const signedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (old.length) await tx.electronicSignature.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      await tx.electronicSignature.create({
        data: {
          documentId: doc!.id,
          signerRole,
          signerId: dto.role === 'PERFORMER' ? user.id : null,
          signerName: dto.signerName.trim(),
          inputMethod: (dto.inputMethod as any) ?? 'TOUCH',
          signatureImagePath: key,
          signedAt,
          ipAddress: ip || 'unknown',
          userAgent: (userAgent || 'unknown').slice(0, 300),
        },
      });
      const data: AnyData = { ...((p.data ?? {}) as AnyData) };
      const roleKey = dto.role === 'PERFORMER' ? 'performer' : 'representative';
      data.signoff = {
        ...(data.signoff ?? {}),
        [roleKey]: {
          ...(data.signoff?.[roleKey] ?? {}),
          name: dto.signerName.trim(),
          ...(dto.role === 'PERFORMER' && dto.qualifications !== undefined ? { qualifications: dto.qualifications } : {}),
          signedAt: signedAt.toISOString(),
        },
      };
      await tx.measurement.update({ where: { id }, data: { data: data as any, lastAutosaveAt: new Date() } });
    });
    await Promise.all(old.map((o) => this.storage.delete(o.signatureImagePath)));
    return this.findOne(id, user);
  }

  async removeSignature(id: string, role: string, user: AuthenticatedUser) {
    const p = await this.loadFull(id);
    await this.assertCanView(user, p);
    this.assertEditable(user, p);
    const signerRole = role === 'PERFORMER' ? 'INSTALLER' : 'CLIENT';
    const sigs = (p.signableDocument?.signatures ?? []).filter((s) => s.signerRole === signerRole);
    if (!sigs.length) return this.findOne(id, user);
    const data: AnyData = { ...((p.data ?? {}) as AnyData) };
    const roleKey = role === 'PERFORMER' ? 'performer' : 'representative';
    if (data.signoff?.[roleKey]) {
      data.signoff = { ...data.signoff, [roleKey]: { ...data.signoff[roleKey], signedAt: undefined } };
    }
    await this.prisma.$transaction([
      this.prisma.electronicSignature.deleteMany({ where: { id: { in: sigs.map((s) => s.id) } } }),
      this.prisma.measurement.update({ where: { id }, data: { data: data as any } }),
    ]);
    await Promise.all(sigs.map((s) => this.storage.delete(s.signatureImagePath)));
    return this.findOne(id, user);
  }

  // =========================================================================
  // Załączniki
  // =========================================================================

  async addAttachment(id: string, dto: UploadAttachmentDto, user: AuthenticatedUser) {
    const p = await this.prisma.measurement.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    await this.assertCanView(user, p);
    this.assertEditable(user, p);

    const ext = (dto.fileName.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new BadRequestException('Niedozwolony typ pliku');
    const raw = dto.base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length === 0) throw new BadRequestException('Pusty plik');
    if (buffer.length > MAX_ATTACHMENT_BYTES) throw new PayloadTooLargeException('Plik jest za duży (maks. 12 MB)');

    const safeName = dto.fileName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
    const isImage = IMAGE_EXT.has(ext);
    let filePath: string;
    let thumbnailPath: string | null = null;
    if (isImage) {
      const saved = await this.storage.savePhotoWithThumbnail(buffer, safeName, `protocols/${id}`);
      filePath = saved.fullResPath;
      thumbnailPath = saved.thumbnailPath;
    } else {
      filePath = await this.storage.saveDocument(buffer, safeName, `protocols/${id}`);
    }
    const kind = isImage ? 'PHOTO' : dto.fieldKey?.startsWith('instruments:') ? 'CERTIFICATE' : 'DOCUMENT';
    const att = await this.prisma.protocolAttachment.create({
      data: {
        protocolId: id,
        kind,
        fieldKey: dto.fieldKey ?? null,
        fileName: safeName,
        mimeType: dto.mimeType ?? null,
        sizeBytes: buffer.length,
        filePath,
        thumbnailPath,
        uploadedById: user.id,
      },
    });
    await this.prisma.measurement.update({ where: { id }, data: { lastAutosaveAt: new Date() } });
    return {
      id: att.id,
      kind: att.kind,
      fieldKey: att.fieldKey,
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      createdAt: att.createdAt,
      url: await this.storage.getSignedUrl(att.filePath),
      thumbnailUrl: att.thumbnailPath ? await this.storage.getSignedUrl(att.thumbnailPath) : null,
    };
  }

  async removeAttachment(id: string, attId: string, user: AuthenticatedUser) {
    const p = await this.prisma.measurement.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    await this.assertCanView(user, p);
    this.assertEditable(user, p);
    const att = await this.prisma.protocolAttachment.findFirst({ where: { id: attId, protocolId: id } });
    if (!att) throw new NotFoundException('Załącznik nie został znaleziony');
    await this.prisma.protocolAttachment.delete({ where: { id: attId } });
    await this.storage.delete(att.filePath);
    if (att.thumbnailPath) await this.storage.delete(att.thumbnailPath);
    return { ok: true };
  }

  // =========================================================================
  // Integracje: rozdzielnie, sprzęt, użytkownicy
  // =========================================================================

  async listBoards(id: string, user: AuthenticatedUser) {
    const p = await this.prisma.measurement.findUnique({ where: { id }, select: { siteId: true, performedById: true } });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    await this.assertCanView(user, p);
    if (!p.siteId) return [];
    const boards = await this.prisma.distributionBoard.findMany({
      where: { siteId: p.siteId },
      select: { id: true, name: true, description: true, _count: { select: { devices: true } } },
      orderBy: { name: 'asc' },
    });
    return boards.map((b) => ({ id: b.id, name: b.name, description: b.description, deviceCount: b._count.devices }));
  }

  /**
   * Import danych z modułu „Rozdzielnie”: dopisuje wiersze (obwody, zabezpieczenia, RCD) do wybranych tabel.
   * Wiersz zapamiętuje sourceDeviceId, więc ponowny import nie dubluje pozycji.
   */
  async importBoard(id: string, dto: ImportBoardDto, user: AuthenticatedUser) {
    const p = await this.prisma.measurement.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    await this.assertCanView(user, p);
    this.assertEditable(user, p);
    if (!p.siteId) throw new BadRequestException('Import z rozdzielnic działa tylko dla budowy z P-Troy');

    const board = await this.prisma.distributionBoard.findFirst({
      where: { id: dto.boardId, siteId: p.siteId },
      include: { devices: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!board) throw new NotFoundException('Rozdzielnica nie została znaleziona na tej budowie');

    const wanted = new Set(dto.sections?.length ? dto.sections : ['continuity', 'insulation', 'loop', 'rcd']);
    const data: AnyData = { ...((p.data ?? {}) as AnyData) };
    const have = (key: string) => new Set((Array.isArray(data[key]) ? data[key] : []).map((r: any) => r.sourceDeviceId).filter(Boolean));
    const add = (key: string, row: Record<string, any>) => {
      if (!wanted.has(key)) return;
      const seen = have(key);
      if (seen.has(row.sourceDeviceId)) return;
      data[key] = [...(Array.isArray(data[key]) ? data[key] : []), { id: newId(), ...row }];
    };

    let added = 0;
    for (const d of board.devices) {
      const amps = d.ratedCurrent ? parseNum(d.ratedCurrent.replace(/a$/i, '')) : null;
      const label = d.description?.trim() || (d.position ? `Obwód ${d.position}` : 'Obwód');
      const circuit = `${board.name}: ${label}`;
      const before = JSON.stringify(Object.keys(data).map((k) => (Array.isArray(data[k]) ? data[k].length : 0)));
      if (d.category === 'RCD') {
        add('rcd', {
          sourceDeviceId: d.id,
          location: `${board.name}${d.description ? ` — ${d.description}` : ''}`,
          rcdType: d.rcdType ?? '',
          inA: amps ?? '',
        });
      } else {
        const protection = `${d.mcbCurve ?? ''}${amps ?? d.ratedCurrent ?? ''}`.trim();
        add('continuity', { sourceDeviceId: d.id, circuit });
        add('insulation', { sourceDeviceId: d.id, circuit, protection });
        if (d.category === 'MCB') {
          add('loop', {
            sourceDeviceId: d.id,
            circuit,
            protection,
            protectionType: 'MCB',
            inA: amps ?? '',
            characteristic: d.mcbCurve ?? '',
          });
        }
      }
      const after = JSON.stringify(Object.keys(data).map((k) => (Array.isArray(data[k]) ? data[k].length : 0)));
      if (before !== after) added++;
    }

    const custom = await this.activeCustom();
    const normalized = this.normalizeData(data, await this.getCalcConfig(), custom.sections);
    await this.prisma.measurement.update({ where: { id }, data: { data: normalized as any, lastAutosaveAt: new Date() } });
    const detail = await this.findOne(id, user);
    return { protocol: detail, imported: added };
  }

  async listInstruments(q: { q?: string; all?: string }) {
    const where: Prisma.AssetWhereInput = {
      ...(q.all === '1' ? {} : { category: { name: 'Mierniki' } }),
      ...(q.q?.trim()
        ? {
            OR: [
              { name: { contains: q.q.trim(), mode: 'insensitive' } },
              { manufacturer: { contains: q.q.trim(), mode: 'insensitive' } },
              { model: { contains: q.q.trim(), mode: 'insensitive' } },
              { serialNumber: { contains: q.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.asset.findMany({
      where,
      select: { id: true, name: true, manufacturer: true, model: true, serialNumber: true, category: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 100,
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      manufacturer: a.manufacturer ?? '',
      model: a.model ?? '',
      serialNumber: a.serialNumber ?? '',
      kind: a.category.name,
    }));
  }

  async listPerformers(user: AuthenticatedUser) {
    const where: Prisma.UserWhereInput = isPrivileged(user.role) ? { isActive: true } : { id: user.id };
    const rows = await this.prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, firstName: u.firstName, lastName: u.lastName, phone: u.phone, email: u.email, role: u.role }));
  }

  // =========================================================================
  // PDF: pełny / same pomiary / pusty formularz
  // =========================================================================

  private logoPath(): string | null {
    const candidates = [
      process.env.PROTOCOL_LOGO_PATH,
      path.join(process.cwd(), 'assets', 'logo.png'),
      path.resolve(__dirname, '../../../../assets/logo.png'),
    ].filter(Boolean) as string[];
    return candidates.find((c) => fs.existsSync(c)) ?? null;
  }

  private async readStream(key: string): Promise<Buffer> {
    const stream = await this.storage.getObjectStream(key);
    const chunks: Buffer[] = [];
    for await (const c of stream as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks);
  }

  private async loadImages(p: Awaited<ReturnType<ProtocolsService['loadFull']>>): Promise<PdfImage[]> {
    const photos = p.attachments.filter((a) => a.kind === 'PHOTO').slice(0, MAX_PDF_IMAGES);
    const out: PdfImage[] = [];
    for (const a of photos) {
      try {
        const raw = await this.readStream(a.filePath);
        const jpg = await sharp(raw).rotate().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer();
        let caption = a.fileName;
        const m = /^defects:([^:]+):(before|after)$/.exec(a.fieldKey ?? '');
        if (m) {
          const row = (((p.data as AnyData)?.defects ?? []) as any[]).find((r) => r.id === m[1]);
          caption = `Usterka ${row?.no || ''} — ${m[2] === 'before' ? 'przed usunięciem' : 'po usunięciu'}`.replace('  ', ' ');
        }
        out.push({ fieldKey: a.fieldKey, caption, bytes: jpg, kind: 'jpg' });
      } catch (err) {
        this.logger.warn(`Pominięto zdjęcie ${a.id} w PDF: ${(err as Error).message}`);
      }
    }
    return out;
  }

  private async loadSignatures(p: Awaited<ReturnType<ProtocolsService['loadFull']>>): Promise<PdfSignature[]> {
    const out: PdfSignature[] = [];
    const data = (p.data ?? {}) as AnyData;
    for (const s of p.signableDocument?.signatures ?? []) {
      const role = s.signerRole === 'INSTALLER' ? 'PERFORMER' : 'REPRESENTATIVE';
      let image: PdfSignature['image'] = null;
      try {
        image = { bytes: await this.readStream(s.signatureImagePath), kind: s.signatureImagePath.endsWith('.png') ? 'png' : 'jpg' };
      } catch {
        image = null;
      }
      out.push({
        role,
        name: s.signerName,
        qualifications: role === 'PERFORMER' ? data.signoff?.performer?.qualifications ?? null : null,
        signedAt: s.signedAt,
        image,
      });
    }
    return out;
  }

  private async buildPdfInput(
    p: Awaited<ReturnType<ProtocolsService['loadFull']>>,
    mode: 'FULL' | 'MEASUREMENTS' | 'BLANK',
    opts: { sections?: string[]; blankRows?: number },
  ): Promise<ProtocolPdfInput> {
    const info = await this.objectInfo(p);
    const custom = await this.activeCustom();
    // Dla zatwierdzonego protokołu także nieaktywne (wycofane) definicje — żeby historia się drukowała.
    const allCustom = p.approvedAt ? (await this.getDefinitions()).customSections : custom.sections;
    const allFields = p.approvedAt ? (await this.getDefinitions()).customFields : custom.fields;
    const data = (p.data ?? {}) as AnyData;
    const objectType = p.objectType;
    const performerExt = p.performerExternal as any;
    const performerName = performerExt?.name || `${p.performedBy.firstName} ${p.performedBy.lastName}`.trim();

    let sections: SectionDef[];
    if (mode === 'BLANK') {
      const keys = opts.sections?.length ? new Set(opts.sections) : null;
      sections = mergedSections(allCustom).filter((s) => {
        if (!s.measurement) return false;
        if (!['table', 'checklist', 'lightning'].includes(s.kind)) return false;
        if (keys) return keys.has(s.key) || (s.isCustom && keys.has('__custom__'));
        return !s.isCustom && ['continuity', 'insulation', 'loop', 'rcd', 'earthing'].includes(s.key);
      });
    } else {
      sections = printableSections(objectType, data, allCustom);
      if (mode === 'MEASUREMENTS') {
        const keys = opts.sections?.length ? new Set(opts.sections) : null;
        sections = sections.filter((s) => s.measurement && (!keys || keys.has(s.key) || (s.isCustom && keys.has('__custom__'))));
      }
    }

    const objectTypeLabel =
      objectType === 'OTHER' && p.objectTypeName ? p.objectTypeName : objectType ? OBJECT_TYPE_LABELS[objectType] : '';
    const kindLabel =
      p.inspectionKind === 'OTHER' && p.inspectionKindName ? p.inspectionKindName : p.inspectionKind ? INSPECTION_KIND_LABELS[p.inspectionKind] : '';

    const client: { label: string; value: string }[] = [
      { label: 'Budowa', value: info.name },
      { label: 'Inwestor', value: info.investor },
      { label: 'Właściciel', value: info.owner },
      { label: 'Zarządca', value: info.administrator },
      { label: 'Osoba kontaktowa', value: [info.contactPerson, info.phone, info.email].filter(Boolean).join(', ') },
      { label: 'Kierownik budowy', value: info.siteManager },
      { label: 'Wykonawca', value: info.contractor },
      { label: 'Dodatkowe informacje', value: info.additionalInfo },
    ].filter((r) => r.value);
    const performer: { label: string; value: string }[] = [
      { label: 'Osoba wykonująca', value: performerName },
      { label: 'Firma', value: performerExt?.company ?? '' },
      { label: 'Telefon', value: performerExt?.phone ?? p.performedBy.phone ?? '' },
      { label: 'E-mail', value: performerExt?.email ?? p.performedBy.email ?? '' },
      { label: 'Uprawnienia', value: [performerExt?.qualificationsNumber, performerExt?.qualificationsScope].filter(Boolean).join(', ') || data.signoff?.performer?.qualifications || '' },
      { label: 'Nr świadectwa kwalifikacyjnego', value: performerExt?.certificateNumber ?? '' },
      { label: 'Ważność świadectwa', value: formatPlDate(performerExt?.certificateValidUntil) },
    ].filter((r) => r.value);

    const images = mode === 'FULL' ? await this.loadImages(p) : [];
    const attachmentNames = mode === 'FULL' ? p.attachments.filter((a) => a.kind !== 'PHOTO').map((a) => a.fileName) : [];
    const signatures = mode === 'BLANK' ? [] : await this.loadSignatures(p);

    return {
      mode,
      number: p.number,
      version: p.version,
      approved: !!p.approvedAt,
      header: {
        objectName: info.name,
        address: info.address,
        siteName: info.name,
        objectTypeLabel,
        dateLabel: formatPlDate(p.performedAt),
        performerName,
      },
      details: {
        inspectionKindLabel: kindLabel,
        startedAt: formatPlDate(p.startedAt),
        finishedAt: formatPlDate(p.finishedAt),
        nextInspectionDate: formatPlDate(p.nextInspectionDate),
        client,
        performer,
      },
      sections,
      data,
      customFields: allFields.map((f) => ({ sectionKey: f.sectionKey, key: f.key, label: f.label, type: f.type, unit: f.unit })),
      signatures,
      images,
      attachmentNames,
      generatedAt: new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
      blankRows: opts.blankRows,
      logoPath: this.logoPath(),
    };
  }

  async print(id: string, dto: PrintProtocolDto, user: AuthenticatedUser) {
    const p = await this.loadFull(id);
    await this.assertCanView(user, p);
    if (this.isLegacy(p)) {
      if (p.protocolPdfPath && dto.mode === 'FULL') {
        return { pdfUrl: await this.storage.getSignedUrl(p.protocolPdfPath), fileName: `Pomiar_${p.number.replace(/\//g, '-')}.pdf` };
      }
      throw new BadRequestException('Stary pomiar — wydruk niedostępny');
    }
    const mode = dto.mode as 'FULL' | 'MEASUREMENTS' | 'BLANK';
    const input = await this.buildPdfInput(p, mode, { sections: dto.sections, blankRows: dto.blankRows });
    if (mode !== 'FULL' && input.sections.length === 0) {
      throw new BadRequestException(
        mode === 'BLANK' ? 'Wybierz przynajmniej jedną sekcję do wydruku.' : 'Brak wypełnionych pomiarów do wydrukowania w wybranym zakresie.',
      );
    }
    const key = `protocols/${id}/print-${mode.toLowerCase()}-${Date.now()}.pdf`;
    await this.pdf.render(input, key);

    await this.prisma.protocolPrintLog.create({
      data: {
        protocolId: id,
        userId: user.id,
        mode,
        scope: { sections: input.sections.map((s) => s.key), blankRows: dto.blankRows ?? null, action: dto.action ?? 'DOWNLOAD' } as any,
        protocolVersion: p.version,
        protocolStatus: p.approvedAt ? 'APPROVED' : 'DRAFT',
      },
    });

    const prefix = mode === 'FULL' ? 'Protokol' : mode === 'MEASUREMENTS' ? 'Pomiary' : 'Formularz-pomiarowy';
    return { pdfUrl: await this.storage.getSignedUrl(key), fileName: pdfFileName(prefix, p.number, input.header.objectName) };
  }

  async printLogs(id: string, user: AuthenticatedUser) {
    const p = await this.prisma.measurement.findUnique({ where: { id }, select: { performedById: true, siteId: true } });
    if (!p) throw new NotFoundException('Protokół nie został znaleziony');
    await this.assertCanView(user, p);
    if (!isPrivileged(user.role)) throw new ForbiddenException('Historię wydruków widzi administrator lub brygadzista');
    const rows = await this.prisma.protocolPrintLog.findMany({
      where: { protocolId: id },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      at: r.createdAt,
      user: `${r.user.firstName} ${r.user.lastName}`,
      mode: r.mode,
      scope: r.scope,
      version: r.protocolVersion,
      status: r.protocolStatus,
    }));
  }

  // =========================================================================
  // Terminy badań
  // =========================================================================

  async deadlines(user: AuthenticatedUser, includeClosed = false) {
    const rows = await this.prisma.measurement.findMany({
      where: {
        AND: [
          await this.accessFilter(user),
          { approvedAt: { not: null }, nextInspectionDate: { not: null }, ...(includeClosed ? {} : { deadlineClosedAt: null }) },
        ],
      },
      select: {
        id: true,
        number: true,
        nextInspectionDate: true,
        deadlineClosedAt: true,
        objectType: true,
        objectTypeName: true,
        inspectionKind: true,
        siteId: true,
        siteSnapshot: true,
        externalSite: true,
        site: { select: { name: true, address: true } },
        performedBy: { select: { firstName: true, lastName: true } },
        performerExternal: true,
      },
      orderBy: { nextInspectionDate: 'asc' },
      take: 1000,
    });
    const now = new Date();
    return rows.map((r) => {
      const snap = r.siteSnapshot as any;
      const days = daysUntil(r.nextInspectionDate!, now);
      return {
        id: r.id,
        number: r.number,
        siteId: r.siteId,
        siteName: snap?.name ?? r.site?.name ?? (r.externalSite as any)?.name ?? '',
        address: snap?.address ?? r.site?.address ?? (r.externalSite as any)?.address ?? '',
        objectTypeLabel: r.objectType === 'OTHER' && r.objectTypeName ? r.objectTypeName : r.objectType ? OBJECT_TYPE_LABELS[r.objectType] : '',
        inspectionKindLabel: r.inspectionKind ? INSPECTION_KIND_LABELS[r.inspectionKind] : '',
        performerName: (r.performerExternal as any)?.name || `${r.performedBy.firstName} ${r.performedBy.lastName}`,
        nextInspectionDate: toDateOnly(r.nextInspectionDate),
        daysToNext: days,
        band: deadlineBand(days),
        closed: !!r.deadlineClosedAt,
      };
    });
  }

  /**
   * Codzienne przypomnienia o terminie kolejnego badania (14 / 7 dni, w dniu terminu, po terminie).
   * Wykorzystuje istniejący NotificationsService (panel, WebSocket, push) — bez drugiego systemu powiadomień.
   * Dziennik ProtocolReminderLog (protocolId + kind + dueDate) chroni przed duplikatami i pozwala
   * „nadrobić” przypomnienie po awarii serwera.
   */
  async runReminders(now: Date = new Date()) {
    const candidates = await this.prisma.measurement.findMany({
      where: { approvedAt: { not: null }, nextInspectionDate: { not: null }, deadlineClosedAt: null },
      select: {
        id: true,
        number: true,
        nextInspectionDate: true,
        performedById: true,
        siteId: true,
        siteSnapshot: true,
        externalSite: true,
        site: { select: { name: true, address: true } },
      },
    });
    if (candidates.length === 0) return { checked: 0, sent: 0 };

    const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'KIEROWNIK'] }, isActive: true }, select: { id: true } });
    let sent = 0;

    for (const c of candidates) {
      try {
        const due = c.nextInspectionDate!;
        const days = daysUntil(due, now);
        if (days > 14) continue;
        const logs = await this.prisma.protocolReminderLog.findMany({ where: { protocolId: c.id, dueDate: due }, select: { kind: true } });
        const kind = reminderToSend(days, new Set(logs.map((l) => l.kind)));
        if (!kind) continue;

        const snap = c.siteSnapshot as any;
        const ext = c.externalSite as any;
        const { title, message } = reminderMessage(kind, {
          siteName: snap?.name ?? c.site?.name ?? ext?.name ?? '—',
          address: snap?.address ?? c.site?.address ?? ext?.address ?? null,
          dueDate: due,
          days,
          number: c.number,
        });

        const ids = new Set<string>([...admins.map((a) => a.id), c.performedById]);
        // Zapisujemy wpis dziennika PRZED wysyłką — przy awarii wolimy pominąć niż zasypać duplikatami.
        await this.prisma.protocolReminderLog.create({ data: { protocolId: c.id, kind, dueDate: due, recipients: ids.size } });
        await this.notifications.notifyUsers([...ids], {
          type: 'PROTOCOL_DUE',
          title,
          message,
          entityType: 'Measurement',
          entityId: c.id,
        });
        sent++;
      } catch (err) {
        this.logger.warn(`Przypomnienie dla ${c.number} nie powiodło się: ${(err as Error).message}`);
      }
    }
    return { checked: candidates.length, sent };
  }
}
