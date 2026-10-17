import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { FileStorageService } from '../../../common/storage/file-storage.service';
import { ellipsize, wrap } from '../../orders/orders-pdf.service';

const DEJAVU = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const DEJAVU_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const A4_W = 595.28;
const A4_H = 841.89;
const M = 36;
const FOOT = 28;
const DARK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.8, 0.8, 0.8);
const HEAD_BG = rgb(0.93, 0.93, 0.93);
const ORANGE = rgb(0.95, 0.45, 0.13);

export interface SimplePdfInput {
  company: string;
  number: string;
  name: string;
  site: { name: string; address: string; investor: string; contactPerson: string; phone: string };
  performedAt: string;
  author: string;
  description: string;
  items: { name: string; quantity: number; custom: boolean }[];
  photos: { bytes: Uint8Array }[];
  generatedAt: string;
  logoPath?: string | null;
}

const fmtDate = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ymd;
};
const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

@Injectable()
export class SimpleProtocolPdfService {
  constructor(private readonly storage: FileStorageService) {}

  async renderBytes(input: SimplePdfInput): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fs.readFileSync(DEJAVU), { subset: true });
    const bold = await doc.embedFont(fs.readFileSync(DEJAVU_BOLD), { subset: true });
    doc.setTitle(`Protokół ${input.number}`);
    doc.setProducer('P-Troy');

    let logo: { img: any; w: number; h: number } | null = null;
    try {
      if (input.logoPath && fs.existsSync(input.logoPath)) {
        const bytes = fs.readFileSync(input.logoPath);
        const img = path.extname(input.logoPath).toLowerCase() === '.png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const s = img.scaleToFit(96, 34);
        logo = { img, w: s.width, h: s.height };
      }
    } catch { logo = null; }

    const pages: PDFPage[] = [];
    let page!: PDFPage;
    let y = 0;
    const W = A4_W - M * 2;

    const newPage = () => {
      page = doc.addPage([A4_W, A4_H]);
      pages.push(page);
      const top = A4_H - M;
      if (logo) page.drawImage(logo.img, { x: M, y: top - logo.h, width: logo.w, height: logo.h });
      else page.drawText('P-Troy', { x: M, y: top - 20, size: 20, font: bold, color: ORANGE });
      const right = (t: string, size: number, f: PDFFont, dy: number, color = DARK) =>
        page.drawText(t, { x: A4_W - M - f.widthOfTextAtSize(t, size), y: top - dy, size, font: f, color });
      right(ellipsize(input.company, bold, 10, 300), 10, bold, 10);
      right(input.number, 11, bold, 28, ORANGE);
      y = top - 50;
      page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.8, color: LINE });
      y -= 8;
    };
    const ensure = (h: number, redraw?: () => void) => {
      if (y - h < M + FOOT) { newPage(); redraw?.(); }
    };

    newPage();
    // Tytuł
    const title = 'Protokół wykonanych prac';
    page.drawText(title, { x: M, y: y - 18, size: 15, font: bold, color: DARK });
    y -= 26;
    for (const l of wrap(input.name, bold, 11, W)) { ensure(16); page.drawText(l, { x: M, y: y - 12, size: 11, font: bold, color: ORANGE }); y -= 15; }
    y -= 8;

    // Dane budynku i daty
    const rows: [string, string][] = [
      ['Budynek', input.site.name],
      ['Adres', input.site.address || '—'],
      ...(input.site.investor ? ([['Inwestor', input.site.investor]] as [string, string][]) : []),
      ...(input.site.contactPerson || input.site.phone ? ([['Kontakt', [input.site.contactPerson, input.site.phone].filter(Boolean).join(', ')]] as [string, string][]) : []),
      ['Data wykonania', fmtDate(input.performedAt)],
      ['Wykonał', input.author],
    ];
    for (const [k, v] of rows) {
      const lines = wrap(v, bold, 10, W - 100);
      ensure(lines.length * 13 + 2);
      page.drawText(k, { x: M, y: y - 10, size: 9, font, color: GREY });
      lines.forEach((l, i) => page.drawText(l, { x: M + 100, y: y - 10 - i * 13, size: 10, font: bold, color: DARK }));
      y -= lines.length * 13 + 2;
    }
    y -= 8;

    // Opis prac
    ensure(40);
    page.drawText('Opis wykonanych prac', { x: M, y: y - 11, size: 11, font: bold, color: DARK });
    y -= 20;
    const desc = input.description.trim() ? input.description : '—';
    for (const l of wrap(desc, font, 10, W)) {
      ensure(14);
      page.drawText(l, { x: M, y: y - 10, size: 10, font, color: DARK });
      y -= 13.5;
    }
    y -= 10;

    // Tabela elementów (tylko ilość > 0)
    if (input.items.length) {
      const cols = [{ label: 'LP', w: 34, right: true }, { label: 'Element', w: W - 34 - 90 }, { label: 'Ilość (szt.)', w: 90, right: true }];
      const head = () => {
        page.drawRectangle({ x: M, y: y - 18, width: W, height: 18, color: HEAD_BG });
        let x = M;
        for (const c of cols) {
          const tw = bold.widthOfTextAtSize(c.label, 8.5);
          page.drawText(c.label, { x: c.right ? x + c.w - 5 - tw : x + 5, y: y - 12.5, size: 8.5, font: bold, color: DARK });
          x += c.w;
        }
        y -= 18;
      };
      ensure(60);
      page.drawText('Zamontowane elementy', { x: M, y: y - 11, size: 11, font: bold, color: DARK });
      y -= 20;
      head();
      input.items.forEach((it, idx) => {
        const lines = wrap(it.name, font, 9.5, cols[1].w - 10);
        const h = lines.length * 12 + 6;
        ensure(h, head);
        page.drawText(String(idx + 1), { x: M + cols[0].w - 5 - font.widthOfTextAtSize(String(idx + 1), 9.5), y: y - 12, size: 9.5, font, color: DARK });
        lines.forEach((l, i) => page.drawText(l, { x: M + cols[0].w + 5, y: y - 12 - i * 12, size: 9.5, font, color: DARK }));
        const q = fmtQty(it.quantity);
        page.drawText(q, { x: M + W - 5 - bold.widthOfTextAtSize(q, 9.5), y: y - 12, size: 9.5, font: bold, color: DARK });
        y -= h;
        page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.4, color: LINE });
      });
      y -= 14;
    }

    // Miejsce na podpisy
    ensure(80);
    y -= 30;
    const half = (W - 40) / 2;
    for (const [i, label] of ['Wykonawca', 'Odbierający'].entries()) {
      const x = M + i * (half + 40);
      page.drawLine({ start: { x, y }, end: { x: x + half, y }, thickness: 0.6, color: DARK });
      page.drawText(label, { x, y: y - 12, size: 8.5, font, color: GREY });
    }
    y -= 24;

    // Zdjęcia: załącznik na osobnych stronach (4 na stronę: 2 x 2)
    if (input.photos.length) {
      const cellW = (W - 14) / 2;
      for (let i = 0; i < input.photos.length; i++) {
        if (i % 4 === 0) {
          newPage();
          page.drawText(`Załącznik: zdjęcia (${i + 1}–${Math.min(i + 4, input.photos.length)} z ${input.photos.length})`, { x: M, y: y - 14, size: 11, font: bold, color: DARK });
          y -= 28;
        }
        const slot = i % 4;
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        const x = M + col * (cellW + 14);
        const rowH = (A4_H - 2 * M - 120) / 2;
        const cy = y - row * rowH;
        try {
          const im = await doc.embedJpg(input.photos[i].bytes);
          const s = im.scaleToFit(cellW, rowH - 22);
          page.drawImage(im, { x: x + (cellW - s.width) / 2, y: cy - s.height, width: s.width, height: s.height });
          page.drawText(`Zdjęcie ${i + 1}`, { x, y: cy - rowH + 12, size: 8, font, color: GREY });
        } catch { /* uszkodzone zdjęcie pomijamy */ }
      }
    }

    pages.forEach((p, i) => {
      p.drawText(`Wygenerowano: ${input.generatedAt}  ·  ${input.number}`, { x: M, y: M - 6, size: 7.5, font, color: GREY });
      const pg = `Strona ${i + 1} / ${pages.length}`;
      p.drawText(pg, { x: A4_W - M - font.widthOfTextAtSize(pg, 7.5), y: M - 6, size: 7.5, font, color: GREY });
    });
    return doc.save();
  }

  async render(input: SimplePdfInput, key: string): Promise<{ pdfPath: string }> {
    const bytes = await this.renderBytes(input);
    await this.storage.saveDocumentAtKey(Buffer.from(bytes), key);
    return { pdfPath: key };
  }
}
