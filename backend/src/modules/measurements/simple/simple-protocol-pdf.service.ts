import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { FileStorageService } from '../../../common/storage/file-storage.service';
import { ellipsize, wrap } from '../../orders/orders-pdf.service';
import type { SimpleRoom } from './simple-protocol.logic';

const DEJAVU = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const DEJAVU_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const A4_W = 595.28;
const A4_H = 841.89;
const M = 36;
const DARK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.8, 0.8, 0.8);
const ORANGE = rgb(0.95, 0.45, 0.13);
const MAX_PHOTOS = 9;

export interface SimplePdfInput {
  company: string;
  site: { name: string; address: string };
  performedAt: string;
  description: string;
  rooms: SimpleRoom[];
  boards?: { name: string; photoCount: number }[];
  photos: { bytes: Uint8Array; caption?: string }[];
  logoPath?: string | null;
}

const fmtDate = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ymd;
};
const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

type Line = { kind: 'head' | 'item'; text: string[]; qty?: string };

/** Protokół prosty: ZAWSZE jedna strona A4 (czcionka maleje, gdy treści jest dużo; zdjęcia w siatce na dole). */
@Injectable()
export class SimpleProtocolPdfService {
  constructor(private readonly storage: FileStorageService) {}

  async renderBytes(input: SimplePdfInput): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fs.readFileSync(DEJAVU), { subset: true });
    const bold = await doc.embedFont(fs.readFileSync(DEJAVU_BOLD), { subset: true });
    doc.setTitle(`Protokół — ${input.site.name}`);
    doc.setProducer('P-Troy');
    const page = doc.addPage([A4_W, A4_H]);
    const W = A4_W - M * 2;

    // Nagłówek: logo (albo „P-Troy”) + nazwa firmy
    let logo: { img: any; w: number; h: number } | null = null;
    try {
      if (input.logoPath && fs.existsSync(input.logoPath)) {
        const bytes = fs.readFileSync(input.logoPath);
        const img = path.extname(input.logoPath).toLowerCase() === '.png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const s = img.scaleToFit(96, 34);
        logo = { img, w: s.width, h: s.height };
      }
    } catch { logo = null; }
    const top = A4_H - M;
    if (logo) page.drawImage(logo.img, { x: M, y: top - logo.h, width: logo.w, height: logo.h });
    else page.drawText('P-Troy', { x: M, y: top - 20, size: 20, font: bold, color: ORANGE });
    const company = ellipsize(input.company, bold, 11, 320);
    page.drawText(company, { x: A4_W - M - bold.widthOfTextAtSize(company, 11), y: top - 14, size: 11, font: bold, color: DARK });
    let y = top - 46;
    page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.8, color: LINE });
    y -= 10;

    // Tytuł, budynek, data
    page.drawText('Protokół wykonanych prac', { x: M, y: y - 16, size: 15, font: bold, color: DARK });
    y -= 30;
    const date = `Data: ${fmtDate(input.performedAt)}`;
    const siteLines = wrap(input.site.name + (input.site.address ? `, ${input.site.address}` : ''), bold, 11, W - 110).slice(0, 2);
    siteLines.forEach((l, i) => page.drawText(l, { x: M, y: y - 11 - i * 14, size: 11, font: bold, color: ORANGE }));
    page.drawText(date, { x: A4_W - M - font.widthOfTextAtSize(date, 10), y: y - 11, size: 10, font, color: DARK });
    y -= siteLines.length * 14 + 8;

    const bottom = M;
    const avail = y - bottom;
    const photos = input.photos.slice(0, MAX_PHOTOS);
    const textH = photos.length ? Math.round(avail * 0.6) : avail;
    const photoH = avail - textH;

    // ---- treść: pomieszczenia w dwóch kolumnach + notatki; dobieramy największą czcionkę, która się mieści
    const notes = input.description.trim();
    const colW = (W - 20) / 2;
    const sizes = [10.5, 10, 9, 8.5, 8, 7.5, 7, 6.5];
    let chosen = sizes[sizes.length - 1];
    let plan: { cols: Line[][]; noteLines: string[]; truncated: boolean; lead: number } | null = null;

    for (const size of sizes) {
      const lead = size * 1.3;
      const qtyW = 38;
      const lines: Line[] = [];
      for (const r of input.rooms) {
        lines.push({ kind: 'head', text: wrap(r.name, bold, size + 0.5, colW) });
        for (const it of r.items) lines.push({ kind: 'item', text: wrap(it.name, font, size, colW - qtyW - 8), qty: `${fmtQty(it.quantity)} szt.` });
      }
      if (input.boards?.length) {
        lines.push({ kind: 'head', text: ['Rozdzielnie'] });
        for (const b of input.boards) lines.push({ kind: 'item', text: wrap(b.name, font, size, colW - qtyW - 8), qty: b.photoCount ? `${b.photoCount} zdj.` : undefined });
      }
      const noteLines = notes ? wrap(notes, font, size, W) : [];
      const notesH = notes ? (noteLines.length + 1.6) * lead : 0;
      const colLimit = textH - notesH;
      const h = (l: Line) => l.text.length * lead + (l.kind === 'head' ? lead * 0.9 : 0);
      const cols: Line[][] = [[], []];
      let c = 0; let used = 0; let fits = true;
      lines.forEach((l, i) => {
        // nagłówek pomieszczenia nie może zostać sam na dole kolumny
        const need = h(l) + (l.kind === 'head' && lines[i + 1] ? h(lines[i + 1]) : 0);
        if (used + need > colLimit) { if (c === 0) { c = 1; used = 0; } else { fits = false; } }
        if (c === 1 && used + h(l) > colLimit) fits = false;
        cols[c].push(l); used += h(l);
      });
      const noteFits = !notes || notesH <= textH;
      if (fits && noteFits) { chosen = size; plan = { cols, noteLines, truncated: false, lead }; break; }
      if (size === sizes[sizes.length - 1]) {
        // awaryjnie: obcinamy to, co się nie mieści (informując o tym na wydruku)
        const kept: Line[][] = [[], []];
        let cc = 0; let u = 0;
        for (const l of lines) {
          if (u + h(l) > colLimit) { if (cc === 0) { cc = 1; u = 0; } else break; }
          if (u + h(l) > colLimit) break;
          kept[cc].push(l); u += h(l);
        }
        const roomsH = Math.max(0, ...kept.map((col) => col.reduce((n, l) => n + h(l), 0)));
        const maxNote = Math.max(0, Math.floor((textH - roomsH - lead * 3.5) / lead));
        plan = { cols: kept, noteLines: noteLines.slice(0, maxNote), truncated: true, lead };
      }
    }
    const p = plan!;
    const size = chosen;
    const startY = y;
    const colBottoms: number[] = [];
    p.cols.forEach((col, ci) => {
      let cy = startY;
      const x = M + ci * (colW + 20);
      for (const l of col) {
        if (l.kind === 'head') {
          if (cy !== startY) cy -= p.lead * 0.4; // odstęp przed kolejnym pomieszczeniem
          l.text.forEach((t, i) => page.drawText(t, { x, y: cy - size - i * p.lead, size: size + 0.5, font: bold, color: DARK }));
          cy -= l.text.length * p.lead;
          page.drawLine({ start: { x, y: cy - 1 }, end: { x: x + colW, y: cy - 1 }, thickness: 0.5, color: LINE });
          cy -= p.lead * 0.5;
        } else {
          l.text.forEach((t, i) => page.drawText(t, { x: x + 6, y: cy - size - i * p.lead, size, font, color: DARK }));
          if (l.qty) page.drawText(l.qty, { x: x + colW - bold.widthOfTextAtSize(l.qty, size), y: cy - size, size, font: bold, color: DARK });
          cy -= l.text.length * p.lead;
        }
      }
      colBottoms.push(cy);
    });
    if (!input.rooms.length && !input.boards?.length) {
      page.drawText('Brak wpisanych elementów.', { x: M, y: startY - size, size, font, color: GREY });
      colBottoms.push(startY - p.lead * 1.5);
    }
    if (p.noteLines.length) {
      let ny = Math.min(...colBottoms) - p.lead * 0.6;
      page.drawText('Notatki', { x: M, y: ny - size, size: size + 0.5, font: bold, color: DARK });
      ny -= p.lead * 1.3;
      p.noteLines.forEach((t, i) => page.drawText(t, { x: M, y: ny - size - i * p.lead, size, font, color: DARK }));
    }
    if (p.truncated) page.drawText('(część wpisów nie zmieściła się na stronie — pełna treść w aplikacji)', { x: M, y: bottom + photoH + 1, size: 7, font, color: GREY });

    // ---- zdjęcia: siatka w dolnej części strony
    if (photos.length) {
      const cols = photos.length <= 2 ? photos.length : photos.length <= 4 ? 2 : 3;
      const rows = Math.ceil(photos.length / cols);
      const gap = 8;
      const cellW = (W - gap * (cols - 1)) / cols;
      const capH = photos.some((x) => x.caption) ? 10 : 0;
      const cellH = (photoH - 6 - gap * (rows - 1)) / rows - capH;
      for (let i = 0; i < photos.length; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        try {
          const im = await doc.embedJpg(photos[i].bytes);
          const s = im.scaleToFit(cellW, cellH);
          const cx = M + c * (cellW + gap) + (cellW - s.width) / 2;
          const cyTop = bottom + photoH - 6 - r * (cellH + capH + gap);
          page.drawImage(im, { x: cx, y: cyTop - s.height, width: s.width, height: s.height });
          if (photos[i].caption) page.drawText(ellipsize(photos[i].caption!, font, 7.5, cellW), { x: M + c * (cellW + gap), y: cyTop - s.height - 9, size: 7.5, font, color: GREY });
        } catch { /* uszkodzone zdjęcie pomijamy */ }
      }
    }
    return doc.save();
  }

  async render(input: SimplePdfInput, key: string): Promise<{ pdfPath: string }> {
    const bytes = await this.renderBytes(input);
    await this.storage.saveDocumentAtKey(Buffer.from(bytes), key);
    return { pdfPath: key };
  }
}
