import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LabelPrinterService } from '../../common/labels/label-printer.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { LabelProviderRegistryService } from './providers/label-provider-registry.service';
import { CreatePrintJobDto } from './dto/label-template.dto';

const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

@Injectable()
export class PrintJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: LabelProviderRegistryService,
    private readonly labelPrinter: LabelPrinterService,
    private readonly storage: FileStorageService,
  ) {}

  /**
   * Tworzy zlecenie wydruku dla jednego lub wielu rekordów naraz
   * (wydruk masowy — sekcja 4 specyfikacji), renderuje PDF (jedna
   * strona na etykietę) i ZPL (do P-Troy Print Agent), zapisuje
   * historię (PrintJobItem per rekord).
   */
  async create(dto: CreatePrintJobDto, createdById: string) {
    const template = await this.prisma.labelTemplate.findUnique({ where: { id: dto.templateId } });
    if (!template) throw new NotFoundException('Szablon etykiety nie został znaleziony');
    if (!template.isWarning && template.targetType !== dto.targetType) {
      throw new BadRequestException('Ten szablon nie pasuje do wybranego typu elementów');
    }
    if (template.isWarning && !dto.customText?.trim()) {
      throw new BadRequestException('Szablon ostrzegawczy wymaga wpisania treści etykiety');
    }

    const provider = this.registry.get(dto.targetType);
    const fieldsLayout = template.fieldsLayout as unknown as { field?: string; bold?: boolean }[];

    let recordIds = [...new Set(dto.recordIds)];
    if (recordIds.length === 0) throw new BadRequestException('Nie wybrano żadnych elementów do wydruku');

    if (dto.onlyUnprinted) {
      const alreadyPrinted = await this.prisma.printJobItem.findMany({
        where: { recordId: { in: recordIds }, printedAt: { not: null } },
        select: { recordId: true },
      });
      const printedSet = new Set(alreadyPrinted.map((p) => p.recordId));
      recordIds = recordIds.filter((id) => !printedSet.has(id));
      if (recordIds.length === 0) {
        throw new BadRequestException('Wszystkie zaznaczone elementy mają już wcześniejszy wydruk');
      }
    }

    const pages: { recordId: string; recordLabel: string; lines: { text: string; bold?: boolean }[]; qrContent?: string }[] = [];

    for (const recordId of recordIds) {
      const resolved = await provider.resolve(recordId);
      if (!resolved) continue; // rekord mógł zostać usunięty między zaznaczeniem a wydrukiem

      const lines = template.isWarning
        ? [{ text: dto.customText!.trim(), bold: true }]
        : fieldsLayout.map((f) => ({ text: (f.field && resolved.fields[f.field]) || '', bold: f.bold }));

      const qrContent = template.includeQr && FRONTEND_URL ? `${FRONTEND_URL}${resolved.targetPath}` : undefined;
      const recordLabel = template.isWarning ? dto.customText!.trim().slice(0, 60) : resolved.displayName;

      pages.push({ recordId, recordLabel, lines, qrContent });
    }

    if (pages.length === 0) throw new NotFoundException('Żaden z wybranych elementów nie został znaleziony');

    const copies = dto.copies ?? 1;

    const job = await this.prisma.printJob.create({
      data: {
        templateId: template.id,
        targetType: dto.targetType,
        method: dto.method ?? 'browser',
        createdById,
        items: {
          create: pages.map((p) => ({ recordId: p.recordId, recordLabel: p.recordLabel, copies })),
        },
      },
      include: { items: true, template: true },
    });

    // Powielamy strony wg liczby kopii przy renderowaniu (a nie w bazie —
    // historia ma jeden PrintJobItem na rekord, z polem copies)
    const renderPages = pages.flatMap((p) => Array.from({ length: copies }, () => ({ lines: p.lines, qrContent: p.qrContent })));

    const { pdfPath } = await this.labelPrinter.renderJobPdf({
      jobId: job.id,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      pages: renderPages,
    });
    const zpl = this.labelPrinter.renderJobZpl({ widthMm: template.widthMm, heightMm: template.heightMm, pages: renderPages });
    const pdfUrl = await this.storage.getSignedUrl(pdfPath).catch(() => null);

    return { ...job, pdfUrl, zpl };
  }

  async findMany(targetType?: string, recordId?: string) {
    return this.prisma.printJob.findMany({
      where: {
        targetType: targetType as any,
        items: recordId ? { some: { recordId } } : undefined,
      },
      include: { items: true, template: true, createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPdfUrl(id: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Zlecenie wydruku nie zostało znalezione');
    const url = await this.storage.getSignedUrl(`labels/print-jobs/${job.id}.pdf`).catch(() => null);
    if (!url) throw new NotFoundException('Plik etykiety nie jest już dostępny');
    return { pdfUrl: url };
  }

  // Wywoływane po skutecznym wydruku (przeglądarka po window.print, albo
  // P-Troy Print Agent po potwierdzeniu przyjęcia przez drukarkę)
  async markPrinted(id: string, status: 'PRINTED' | 'FAILED') {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Zlecenie wydruku nie zostało znalezione');
    await this.prisma.$transaction([
      this.prisma.printJob.update({ where: { id }, data: { status, printedAt: status === 'PRINTED' ? new Date() : undefined } }),
      ...(status === 'PRINTED'
        ? [this.prisma.printJobItem.updateMany({ where: { printJobId: id }, data: { printedAt: new Date() } })]
        : []),
    ]);
    return { success: true };
  }
}
