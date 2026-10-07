import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { SiteBom, BomRow } from './board-bom';

const DEJAVU_SANS_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const DEJAVU_SANS_BOLD_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const PAGE_W = 595; // A4 pionowo
const PAGE_H = 842;
const MARGIN = 40;
const ROW_H = 17;
const COUNT_W = 70;

function wrap(text: string, font: any, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

@Injectable()
export class DistributionBoardsPdfService {
  constructor(private readonly storage: FileStorageService) {}

  async renderBom(params: { jobKey: string; siteName: string; generatedAt: string; bom: SiteBom }): Promise<{ pdfPath: string }> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fs.readFileSync(DEJAVU_SANS_PATH));
    const bold = await doc.embedFont(fs.readFileSync(DEJAVU_SANS_BOLD_PATH));
    const dark = rgb(0.1, 0.1, 0.1);
    const grey = rgb(0.45, 0.45, 0.45);
    const line = rgb(0.8, 0.8, 0.8);

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    const labelW = PAGE_W - MARGIN * 2 - COUNT_W - 30;

    const ensure = (needed: number) => {
      if (y - needed < MARGIN + 20) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    };

    page.drawText('Wykaz aparatów w rozdzielniach', { x: MARGIN, y: y - 16, size: 17, font: bold, color: dark });
    y -= 34;
    page.drawText(`BUDOWA: ${params.siteName}`, { x: MARGIN, y: y - 9, size: 10, font: bold, color: dark });
    y -= 14;
    page.drawText(`Wygenerowano: ${params.generatedAt}`, { x: MARGIN, y: y - 8, size: 8, font, color: grey });
    y -= 24;

    const table = (title: string, subtitle: string, rows: BomRow[], total: number) => {
      ensure(70);
      page.drawText(title, { x: MARGIN, y: y - 11, size: 12, font: bold, color: dark });
      y -= 16;
      if (subtitle) { page.drawText(subtitle, { x: MARGIN, y: y - 8, size: 8, font, color: grey }); y -= 14; }
      const head = () => {
        page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: PAGE_W - MARGIN * 2, height: ROW_H, color: rgb(0.93, 0.93, 0.93) });
        page.drawText('Lp.', { x: MARGIN + 4, y: y - 12, size: 8, font: bold, color: dark });
        page.drawText('Aparat', { x: MARGIN + 30, y: y - 12, size: 8, font: bold, color: dark });
        page.drawText('Ilość', { x: PAGE_W - MARGIN - COUNT_W + 8, y: y - 12, size: 8, font: bold, color: dark });
        y -= ROW_H;
      };
      head();
      if (rows.length === 0) {
        page.drawText('Brak aparatów.', { x: MARGIN + 30, y: y - 12, size: 9, font, color: grey });
        y -= ROW_H;
      }
      rows.forEach((r, i) => {
        const lines = wrap(r.label, font, 9, labelW);
        const h = Math.max(ROW_H, lines.length * 11 + 6);
        if (y - h < MARGIN + 20) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; head(); }
        page.drawText(`${i + 1}.`, { x: MARGIN + 4, y: y - 12, size: 9, font, color: grey });
        lines.forEach((t, li) => page.drawText(t, { x: MARGIN + 30, y: y - 12 - li * 11, size: 9, font, color: dark }));
        page.drawText(`${r.count} szt.`, { x: PAGE_W - MARGIN - COUNT_W + 8, y: y - 12, size: 9, font: bold, color: dark });
        page.drawLine({ start: { x: MARGIN, y: y - h }, end: { x: PAGE_W - MARGIN, y: y - h }, thickness: 0.4, color: line });
        y -= h;
      });
      ensure(24);
      page.drawText('Razem aparatów:', { x: MARGIN + 30, y: y - 14, size: 9, font: bold, color: dark });
      page.drawText(`${total} szt.`, { x: PAGE_W - MARGIN - COUNT_W + 8, y: y - 14, size: 9, font: bold, color: dark });
      y -= 34;
    };

    const { combined, boards, byCategory } = params.bom;
    table(
      'Razem (wszystkie rozdzielnie)',
      `Bezpieczniki: ${byCategory.mcb} szt. · Różnicówki: ${byCategory.rcd} szt. · Inne aparaty: ${byCategory.other} szt.`,
      combined.rows, combined.total,
    );
    if (boards.length > 1) {
      for (const b of boards) table(`Rozdzielnia: ${b.name}`, `${b.moduleCount} modułów`, b.rows, b.total);
    }

    const pages = doc.getPages();
    pages.forEach((p, i) => {
      p.drawText('Dokument wygenerowano w P-Troy ERP', { x: MARGIN, y: 22, size: 7, font, color: grey });
      const t = `Strona ${i + 1} z ${pages.length}`;
      p.drawText(t, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(t, 7), y: 22, size: 7, font, color: grey });
    });

    const bytes = await doc.save();
    const key = `distribution-boards/bom/${params.jobKey}.pdf`;
    await this.storage.saveDocumentAtKey(Buffer.from(bytes), key);
    return { pdfPath: key };
  }
}
