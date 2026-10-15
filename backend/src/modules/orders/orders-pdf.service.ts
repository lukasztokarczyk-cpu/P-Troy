import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { fmtQty } from './orders-logic';

const DEJAVU_SANS_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const DEJAVU_SANS_BOLD_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 36;
const FOOTER_H = 28;

const DARK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.8, 0.8, 0.8);
const HEAD_BG = rgb(0.93, 0.93, 0.93);
const ORANGE = rgb(0.95, 0.45, 0.13);

export interface OrderPdfInput {
  number: string;
  siteName: string;
  address: string;
  author: string;
  dateLabel: string;
  statusLabel: string;
  note: string;
  items: { name: string; spec: string; quantity: number; unit: string; note: string }[];
  photos: { caption: string; bytes: Uint8Array }[];
  generatedAt: string;
  logoPath?: string | null;
}

function ellipsize(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
  return t + '…';
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    const flushLong = (word: string) => {
      let chunk = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) {
          out.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      return chunk;
    };
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxW) {
        cur = test;
      } else if (font.widthOfTextAtSize(w, size) > maxW) {
        if (cur) out.push(cur);
        cur = flushLong(w);
      } else {
        out.push(cur);
        cur = w;
      }
    }
    out.push(cur);
  }
  return out.length ? out : [''];
}

@Injectable()
export class OrdersPdfService {
  constructor(private readonly storage: FileStorageService) {}

  async renderBytes(input: OrderPdfInput): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fs.readFileSync(DEJAVU_SANS_PATH), { subset: true });
    const bold = await doc.embedFont(fs.readFileSync(DEJAVU_SANS_BOLD_PATH), { subset: true });
    doc.setTitle(`Zamówienie ${input.number}`);
    doc.setProducer('P-Troy');

    let logo: { img: any; w: number; h: number } | null = null;
    try {
      if (input.logoPath && fs.existsSync(input.logoPath)) {
        const bytes = fs.readFileSync(input.logoPath);
        const img = path.extname(input.logoPath).toLowerCase() === '.png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const s = img.scaleToFit(96, 34);
        logo = { img, w: s.width, h: s.height };
      }
    } catch {
      logo = null;
    }

    const pages: PDFPage[] = [];
    let page!: PDFPage;
    let y = 0;
    const contentW = A4_W - MARGIN * 2;

    const newPage = (first: boolean) => {
      page = doc.addPage([A4_W, A4_H]);
      pages.push(page);
      const top = A4_H - MARGIN;
      if (logo) page.drawImage(logo.img, { x: MARGIN, y: top - logo.h, width: logo.w, height: logo.h });
      else page.drawText('P-Troy', { x: MARGIN, y: top - 20, size: 20, font: bold, color: ORANGE });
      const title = 'Lista materiałów do zamówienia';
      const tw = bold.widthOfTextAtSize(title, 12);
      page.drawText(title, { x: A4_W - MARGIN - tw, y: top - 14, size: 12, font: bold, color: DARK });
      const nw = bold.widthOfTextAtSize(input.number, 11);
      page.drawText(input.number, { x: A4_W - MARGIN - nw, y: top - 30, size: 11, font: bold, color: ORANGE });
      y = top - 52;
      if (first) {
        page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y }, thickness: 0.8, color: LINE });
        y -= 16;
        const rows: [string, string][] = [
          ['Budowa', input.siteName],
          ['Adres', input.address || '—'],
          ['Zamawiający', input.author],
          ['Data', input.dateLabel],
          ['Status', input.statusLabel],
        ];
        for (const [k, v] of rows) {
          page.drawText(k, { x: MARGIN, y, size: 9, font, color: GREY });
          page.drawText(ellipsize(v, bold, 10, contentW - 90), { x: MARGIN + 90, y, size: 10, font: bold, color: DARK });
          y -= 15;
        }
        if (input.note.trim()) {
          page.drawText('Uwagi', { x: MARGIN, y, size: 9, font, color: GREY });
          for (const l of wrap(input.note, font, 9.5, contentW - 90)) {
            ensure(14);
            page.drawText(l, { x: MARGIN + 90, y, size: 9.5, font, color: DARK });
            y -= 13;
          }
        }
        y -= 6;
      } else {
        y -= 4;
      }
    };

    const ensure = (h: number, redrawHead?: () => void) => {
      if (y - h < MARGIN + FOOTER_H) {
        newPage(false);
        redrawHead?.();
      }
    };

    // Kolumny tabeli: LP | Nazwa | Specyfikacja | Ilość | Jedn. | Uwagi
    const cols = [
      { key: 'lp', label: 'LP', w: 26, align: 'right' as const },
      { key: 'name', label: 'Nazwa materiału', w: 170 },
      { key: 'spec', label: 'Specyfikacja', w: 110 },
      { key: 'qty', label: 'Ilość', w: 48, align: 'right' as const },
      { key: 'unit', label: 'Jedn.', w: 38 },
      { key: 'note', label: 'Uwagi', w: contentW - (26 + 170 + 110 + 48 + 38) },
    ];
    const SIZE = 9;
    const LH = 11.5;
    const PAD = 4;

    const drawHead = () => {
      const h = 18;
      page.drawRectangle({ x: MARGIN, y: y - h, width: contentW, height: h, color: HEAD_BG });
      let x = MARGIN;
      for (const c of cols) {
        const tw = bold.widthOfTextAtSize(c.label, 8.5);
        const tx = c.align === 'right' ? x + c.w - PAD - tw : x + PAD;
        page.drawText(c.label, { x: tx, y: y - 12.5, size: 8.5, font: bold, color: DARK });
        x += c.w;
      }
      y -= h;
    };

    newPage(true);
    drawHead();

    input.items.forEach((it, idx) => {
      const cells: Record<string, string[]> = {
        lp: [String(idx + 1)],
        name: wrap(it.name, bold, SIZE, cols[1].w - PAD * 2),
        spec: wrap(it.spec, font, SIZE - 0.5, cols[2].w - PAD * 2),
        qty: [fmtQty(it.quantity)],
        unit: [it.unit],
        note: wrap(it.note, font, SIZE - 0.5, cols[5].w - PAD * 2),
      };
      const lines = Math.max(...Object.values(cells).map((c) => c.length));
      const rowH = lines * LH + PAD * 2 - 2;
      ensure(rowH, drawHead);
      let x = MARGIN;
      for (const c of cols) {
        const f = c.key === 'name' || c.key === 'qty' ? bold : font;
        const size = c.key === 'spec' || c.key === 'note' ? SIZE - 0.5 : SIZE;
        cells[c.key].forEach((l, i) => {
          const tw = f.widthOfTextAtSize(l, size);
          const tx = c.align === 'right' ? x + c.w - PAD - tw : x + PAD;
          page.drawText(l, { x: tx, y: y - PAD - 8 - i * LH + 2, size, font: f, color: DARK });
        });
        x += c.w;
      }
      y -= rowH;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + contentW, y }, thickness: 0.4, color: LINE });
    });

    if (input.items.length === 0) {
      page.drawText('Brak pozycji.', { x: MARGIN + PAD, y: y - 14, size: 9, font, color: GREY });
      y -= 20;
    }

    // Zdjęcia — osobna sekcja na końcu, tylko gdy poproszono.
    if (input.photos.length) {
      newPage(false);
      page.drawText('Zdjęcia do zamówienia', { x: MARGIN, y: y - 4, size: 11, font: bold, color: DARK });
      y -= 22;
      const cellW = (contentW - 12) / 2;
      const cellH = 200;
      let col = 0;
      for (const ph of input.photos) {
        try {
          const im = await doc.embedJpg(ph.bytes);
          if (col === 0) ensure(cellH + 24);
          const s = im.scaleToFit(cellW, cellH);
          const x = MARGIN + col * (cellW + 12);
          page.drawImage(im, { x: x + (cellW - s.width) / 2, y: y - s.height, width: s.width, height: s.height });
          page.drawText(ellipsize(ph.caption, font, 8, cellW), { x, y: y - cellH - 11, size: 8, font, color: GREY });
        } catch {
          /* uszkodzone zdjęcie pomijamy */
        }
        col++;
        if (col === 2) {
          col = 0;
          y -= cellH + 24;
        }
      }
    }

    // Stopki (po wszystkim, bo znamy liczbę stron)
    pages.forEach((p, i) => {
      const t = `Wygenerowano: ${input.generatedAt}  ·  ${input.number}`;
      p.drawText(t, { x: MARGIN, y: MARGIN - 6, size: 7.5, font, color: GREY });
      const pg = `Strona ${i + 1} / ${pages.length}`;
      p.drawText(pg, { x: A4_W - MARGIN - font.widthOfTextAtSize(pg, 7.5), y: MARGIN - 6, size: 7.5, font, color: GREY });
    });

    return doc.save();
  }

  async render(input: OrderPdfInput, key: string): Promise<{ pdfPath: string }> {
    const bytes = await this.renderBytes(input);
    await this.storage.saveDocumentAtKey(Buffer.from(bytes), key);
    return { pdfPath: key };
  }
}
