import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { CreatePlanPointDto, UpdatePlanPointDto } from './dto/plan-point.dto';
import {
  resolveSubtype, labelOfKind, labelOfSubtype, labelOfFrameDevice, labelOfBoxType, findKind,
} from './plan-catalog';
import { normalizeFrame, circuitIdsOf, assertCoordinates, summarize, FrameInput, Frame } from './plan-logic';
import { PlanPointsPdfService, PdfPlanGroup, PdfPointRow } from './plan-points-pdf.service';

const orientationLabel = (o?: string) => (o === 'VERTICAL' ? 'pionowa' : 'pozioma');

@Injectable()
export class PlanPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PlanPointsPdfService,
    private readonly storage: FileStorageService,
  ) {}

  // Obwody do wyboru przy punkcie = aparaty z rozdzielni tej budowy (bez RCD — to nie obwód końcowy)
  async circuits(siteId: string) {
    const devices = await this.prisma.distributionBoardDevice.findMany({
      where: { board: { siteId }, category: { not: 'RCD' } },
      include: { board: { select: { name: true, createdAt: true } } },
      orderBy: [{ boardId: 'asc' }, { position: 'asc' }],
    });
    return devices.map((d) => ({
      id: d.id,
      boardName: d.board.name,
      position: d.position,
      description: d.description,
      ratedCurrent: d.ratedCurrent,
      label: `${d.board.name} · ${d.position != null ? 'moduł ' + d.position + ' · ' : ''}${d.description || d.ratedCurrent || 'obwód'}`,
    }));
  }

  private toDto(p: { id: string; prefix: string; seq: number; [k: string]: any }) {
    return { ...p, code: `${p.prefix}.${p.seq}` };
  }

  async list(siteId: string) {
    const points = await this.prisma.sitePlanPoint.findMany({
      where: { siteId },
      orderBy: [{ prefix: 'asc' }, { seq: 'asc' }],
    });
    const summary = summarize(points.map((p) => ({
      kind: p.kind, subtype: p.subtype, boxType: p.boxType, circuitDeviceId: p.circuitDeviceId,
      frame: p.frame as unknown as FrameInput | null,
    })));
    return { points: points.map((p) => this.toDto(p)), summary };
  }

  private async assertCircuitsInSite(siteId: string, ids: string[]) {
    if (ids.length === 0) return;
    const found = await this.prisma.distributionBoardDevice.count({ where: { id: { in: ids }, board: { siteId } } });
    if (found !== ids.length) throw new BadRequestException('Wybrany obwód nie należy do rozdzielni tej budowy');
  }

  async create(siteId: string, planId: string, dto: CreatePlanPointDto, userId: string) {
    const plan = await this.prisma.sitePlan.findFirst({ where: { id: planId, siteId } });
    if (!plan) throw new NotFoundException('Plan nie został znaleziony');
    assertCoordinates(dto.x, dto.y);

    const sub = resolveSubtype(dto.kind, dto.subtype);
    if (!sub) throw new BadRequestException('Nieprawidłowy podtyp punktu');

    const frame = dto.kind === 'FRAME' ? normalizeFrame(dto.frame) : null;
    if (dto.kind !== 'FRAME' && dto.frame) throw new BadRequestException('Ramkę można dodać tylko do punktu typu „Ramka na osprzęt”');
    await this.assertCircuitsInSite(siteId, circuitIdsOf({ circuitDeviceId: dto.circuitDeviceId, frame }));

    for (let attempt = 0; attempt < 5; attempt++) {
      const max = await this.prisma.sitePlanPoint.aggregate({ where: { siteId, prefix: sub.prefix }, _max: { seq: true } });
      const seq = (max._max.seq ?? 0) + 1;
      try {
        const created = await this.prisma.sitePlanPoint.create({
          data: {
            siteId, planId, page: dto.page ?? 1, x: dto.x, y: dto.y,
            kind: dto.kind, subtype: sub.key, prefix: sub.prefix, seq,
            circuitDeviceId: dto.circuitDeviceId ?? null,
            lines: [...new Set((dto.lines ?? []).map((l) => l.trim()).filter(Boolean))],
            smart: dto.smart ?? false,
            boxType: dto.boxType ?? null,
            note: dto.note?.trim() || null,
            frame: frame ? (frame as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            createdById: userId,
          },
        });
        return this.toDto(created);
      } catch (e: any) {
        if (e?.code === 'P2002') continue; // równoległe dodanie tego samego numeru — losujemy następny
        throw e;
      }
    }
    throw new ConflictException('Nie udało się nadać numeru punktu, spróbuj ponownie');
  }

  async update(id: string, dto: UpdatePlanPointDto) {
    const existing = await this.prisma.sitePlanPoint.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Punkt nie został znaleziony');
    if (dto.x !== undefined || dto.y !== undefined) assertCoordinates(dto.x ?? existing.x, dto.y ?? existing.y);

    const data: Prisma.SitePlanPointUpdateInput = {};
    if (dto.x !== undefined) data.x = dto.x;
    if (dto.y !== undefined) data.y = dto.y;
    if (dto.smart !== undefined) data.smart = dto.smart;
    if (dto.boxType !== undefined) data.boxType = dto.boxType;
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.lines !== undefined) data.lines = [...new Set(dto.lines.map((l) => l.trim()).filter(Boolean))];
    if (dto.circuitDeviceId !== undefined) {
      await this.assertCircuitsInSite(existing.siteId, dto.circuitDeviceId ? [dto.circuitDeviceId] : []);
      data.circuitDevice = dto.circuitDeviceId ? { connect: { id: dto.circuitDeviceId } } : { disconnect: true };
    }
    if (dto.frame !== undefined) {
      if (existing.kind !== 'FRAME') throw new BadRequestException('Ramkę można edytować tylko w punkcie typu „Ramka na osprzęt”');
      const frame = normalizeFrame(dto.frame);
      await this.assertCircuitsInSite(existing.siteId, circuitIdsOf({ frame }));
      data.frame = frame as unknown as Prisma.InputJsonValue;
    }
    if (dto.subtype !== undefined && dto.subtype !== existing.subtype) {
      const sub = resolveSubtype(existing.kind, dto.subtype);
      if (!sub) throw new BadRequestException('Nieprawidłowy podtyp punktu');
      data.subtype = sub.key;
      // zmiana prefiksu (np. kinkiet -> plafon) = nowy numer w nowej serii; ten sam prefiks zachowuje numer
      if (sub.prefix !== existing.prefix) {
        const max = await this.prisma.sitePlanPoint.aggregate({ where: { siteId: existing.siteId, prefix: sub.prefix }, _max: { seq: true } });
        data.prefix = sub.prefix;
        data.seq = (max._max.seq ?? 0) + 1;
      }
    }
    try {
      return this.toDto(await this.prisma.sitePlanPoint.update({ where: { id }, data }));
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Konflikt numeracji punktów, spróbuj ponownie');
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.sitePlanPoint.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Punkt nie został znaleziony');
    await this.prisma.sitePlanPoint.delete({ where: { id } });
    return { success: true };
  }

  // ---- Lista punktów w PDF (jak "Lista punktów instalacji elektrycznej") ----
  async exportPdf(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Budowa nie została znaleziona');

    const [points, plans, circuits] = await Promise.all([
      this.prisma.sitePlanPoint.findMany({ where: { siteId }, orderBy: [{ prefix: 'asc' }, { seq: 'asc' }] }),
      this.prisma.sitePlan.findMany({ where: { siteId }, orderBy: { createdAt: 'asc' } }),
      this.circuits(siteId),
    ]);
    const circuitLabel = new Map(circuits.map((c) => [c.id, c.label]));
    const circ = (id?: string | null) => (id ? circuitLabel.get(id) ?? 'Usunięty obwód' : 'Brak obwodu');

    const toRow = (p: (typeof points)[number]): PdfPointRow => {
      const code = `${p.prefix}.${p.seq}`;
      if (p.kind === 'FRAME') {
        const f = normalizeFrame(p.frame as unknown as FrameInput);
        const multi = f.boxes.length > 1;
        const pre = (i: number) => (multi ? `${i + 1}: ` : ''); // numer puszki w ramce
        return {
          code,
          kind: 'Ramka na osprzęt',
          details: [`Ramka ${f.count}-krotna ${orientationLabel(f.orientation)}${f.style ? ' ' + f.style : ''}`,
            ...f.boxes.map((b, i) => `${pre(i)}${labelOfFrameDevice(b.device)}${b.style ? ', styl: ' + b.style : ''}`)],
          circuits: f.boxes.map((b, i) => `${pre(i)}${circ(b.circuitDeviceId)}`),
          lines: f.boxes.map((b, i) => `${pre(i)}${b.lines.length ? b.lines.join(', ') : '—'}`),
          smart: f.boxes.map((b, i) => `${pre(i)}${b.smart ? 'TAK' : 'NIE'}`),
          boxes: f.boxes.map((b, i) => `${pre(i)}${labelOfBoxType(b.boxType) || 'Brak puszki'}`),
          note: p.note ?? '',
        };
      }
      return {
        code,
        kind: labelOfKind(p.kind),
        details: [labelOfSubtype(p.kind, p.subtype) || '—'],
        circuits: [circ(p.circuitDeviceId)],
        lines: [p.lines.length ? p.lines.join(', ') : '—'],
        smart: [p.smart ? 'TAK' : 'NIE'],
        boxes: [labelOfBoxType(p.boxType) || 'Brak puszki'],
        note: p.note ?? '',
      };
    };

    const groups: PdfPlanGroup[] = [];
    for (const plan of plans) {
      const here = points.filter((p) => p.planId === plan.id);
      if (here.length === 0) continue;
      const pages = [...new Set(here.map((p) => p.page))].sort((a, b) => a - b);
      for (const pg of pages) {
        groups.push({
          title: `Rzut: ${plan.fileName}${plan.fileType === 'application/pdf' ? ` (strona ${pg})` : ''}`,
          rows: here.filter((p) => p.page === pg).map(toRow),
        });
      }
    }

    const summary = summarize(points.map((p) => ({
      kind: p.kind, subtype: p.subtype, boxType: p.boxType, circuitDeviceId: p.circuitDeviceId,
      frame: p.frame as unknown as FrameInput | null,
    })));

    const { pdfPath } = await this.pdf.render({
      jobKey: `${siteId}-${Date.now()}`,
      siteName: site.name,
      generatedAt: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
      groups,
      summary,
    });
    return { pdfUrl: await this.storage.getSignedUrl(pdfPath) };
  }
}
