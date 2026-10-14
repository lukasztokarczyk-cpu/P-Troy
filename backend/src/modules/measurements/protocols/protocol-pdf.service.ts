import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { FileStorageService } from '../../../common/storage/file-storage.service';
import {
  SectionDef,
  ColumnDef,
  orientationFor,
  FINAL_RATINGS,
  EXTRAS_FLAGS,
} from './protocol-schema';
import { formatPlDate, meaningfulRows } from './protocol-logic';

const DEJAVU_SANS_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const DEJAVU_SANS_BOLD_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 36;
const HEADER_H = 74;
const FOOTER_H = 26;

const DARK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.9, 0.9, 0.9);
const HEAD_BG = rgb(0.93, 0.93, 0.93);
const ORANGE = rgb(0.95, 0.45, 0.13);
const GREEN = rgb(0.1, 0.5, 0.2);

export type PdfMode = 'FULL' | 'MEASUREMENTS' | 'BLANK';

export interface PdfImage {
  /** Klucz pola, np. "defects:<rowId>:before". Inne klucze trafiają do ogólnej sekcji zdjęć. */
  fieldKey: string | null;
  caption: string;
  bytes: Uint8Array;
  kind: 'jpg' | 'png';
}

export interface PdfSignature {
  role: 'PERFORMER' | 'REPRESENTATIVE';
  name: string;
  qualifications?: string | null;
  signedAt: Date;
  image?: { bytes: Uint8Array; kind: 'png' | 'jpg' } | null;
}

export interface ProtocolPdfInput {
  mode: PdfMode;
  number: string;
  version: number;
  approved: boolean;
  isOldMeasurement?: boolean;
  header: {
    objectName: string;
    address: string;
    siteName: string;
    objectTypeLabel: string;
    dateLabel: string;
    performerName: string;
  };
  details?: {
    inspectionKindLabel?: string;
    startedAt?: string;
    finishedAt?: string;
    nextInspectionDate?: string;
    client?: { label: string; value: string }[];
    performer?: { label: string; value: string }[];
  };
  /** Sekcje do wydruku (już przefiltrowane: dotyczą obiektu, niepuste, w wybranym zakresie). */
  sections: SectionDef[];
  data: Record<string, any>;
  customFields?: { sectionKey: string; key: string; label: string; type: string; unit?: string | null }[];
  signatures?: PdfSignature[];
  images?: PdfImage[];
  attachmentNames?: string[];
  generatedAt: string;
  /** Tryb BLANK: liczba pustych wierszy w tabelach. */
  blankRows?: number;
  logoPath?: string | null;
}

// ---------------------------------------------------------------------------

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
    const pushLong = (word: string) => {
      // Słowo dłuższe niż szerokość — łamiemy twardo po znakach.
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
      const cand = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) <= maxW) {
        cur = cand;
      } else {
        if (cur) out.push(cur);
        cur = font.widthOfTextAtSize(w, size) > maxW ? pushLong(w) : w;
      }
    }
    out.push(cur);
  }
  return out.length ? out : [''];
}

function fmtCell(col: ColumnDef, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (col.type === 'rating') return v === 'ND' ? 'N/D' : String(v);
  if (col.type === 'date') return formatPlDate(v as any) || String(v);
  if (typeof v === 'boolean') return v ? 'Tak' : 'Nie';
  return String(v);
}

const stateLabel = (s: unknown) => (s === 'ND' ? 'N/D' : s ? String(s) : '');

interface PageInfo {
  page: PDFPage;
  w: number;
  h: number;
}

class Builder {
  doc!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  pages: PageInfo[] = [];
  cur!: PageInfo;
  y = 0;
  logo: { img: any; w: number; h: number } | null = null;

  constructor(private readonly input: ProtocolPdfInput) {}

  async init() {
    this.doc = await PDFDocument.create();
    this.doc.registerFontkit(fontkit);
    this.font = await this.doc.embedFont(fs.readFileSync(DEJAVU_SANS_PATH), { subset: true });
    this.bold = await this.doc.embedFont(fs.readFileSync(DEJAVU_SANS_BOLD_PATH), { subset: true });
    this.doc.setTitle(`Protokół ${this.input.number}`);
    this.doc.setProducer('P-Troy');
    const lp = this.input.logoPath;
    try {
      if (lp && fs.existsSync(lp)) {
        const bytes = fs.readFileSync(lp);
        const isPng = path.extname(lp).toLowerCase() === '.png';
        const img = isPng ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
        const s = img.scaleToFit(96, 34);
        this.logo = { img, w: s.width, h: s.height };
      }
    } catch {
      this.logo = null; // brak/uszkodzone logo → wordmark „P-Troy”
    }
  }

  get contentW() {
    return this.cur.w - MARGIN * 2;
  }

  newPage(landscape = false) {
    const w = landscape ? A4_H : A4_W;
    const h = landscape ? A4_W : A4_H;
    const page = this.doc.addPage([w, h]);
    this.cur = { page, w, h };
    this.pages.push(this.cur);
    this.drawHeader();
    this.y = h - MARGIN - HEADER_H - 8;
    return this.cur;
  }

  private drawHeader() {
    const { page, w, h } = this.cur;
    const hd = this.input.header;
    const top = h - MARGIN;
    const left = MARGIN;

    if (this.logo) {
      page.drawImage(this.logo.img, { x: left, y: top - this.logo.h, width: this.logo.w, height: this.logo.h });
    } else {
      page.drawText('P-Troy', { x: left, y: top - 22, size: 20, font: this.bold, color: ORANGE });
    }

    const tx = left + 110;
    const maxW = w - MARGIN - tx - 110;
    const title = this.input.mode === 'FULL' ? 'P-Troy – Protokół kontroli i pomiarów instalacji elektrycznej' : 'P-Troy – Pomiary elektryczne';
    const lines: [string, boolean][] = [
      [title, true],
      [`Obiekt: ${hd.objectName}   Adres: ${hd.address}`, false],
      [`Budowa: ${hd.siteName}   Typ obiektu: ${hd.objectTypeLabel}`, false],
      [`Protokół: ${this.input.number}   Data pomiarów: ${hd.dateLabel}   Wykonał: ${hd.performerName}`, false],
    ];
    lines.forEach(([t, b], i) => {
      const f = b ? this.bold : this.font;
      const size = i === 0 ? 10.5 : 8.5;
      page.drawText(ellipsize(t, f, size, i === 0 ? w - MARGIN - tx : maxW + 100), {
        x: tx,
        y: top - 10 - i * 13,
        size,
        font: f,
        color: i === 0 ? DARK : GREY,
      });
    });

    if (this.input.approved) {
      const label = 'PROTOKÓŁ ZATWIERDZONY';
      const lw = this.bold.widthOfTextAtSize(label, 8);
      page.drawText(label, { x: w - MARGIN - lw, y: top - 62, size: 8, font: this.bold, color: GREEN });
    } else if (!this.input.isOldMeasurement) {
      const label = 'WERSJA ROBOCZA';
      const lw = this.bold.widthOfTextAtSize(label, 8);
      page.drawText(label, { x: w - MARGIN - lw, y: top - 62, size: 8, font: this.bold, color: rgb(0.75, 0.2, 0.1) });
    }

    page.drawLine({
      start: { x: MARGIN, y: top - HEADER_H + 4 },
      end: { x: w - MARGIN, y: top - HEADER_H + 4 },
      thickness: 0.8,
      color: ORANGE,
    });
  }

  ensure(needed: number) {
    if (this.y - needed < MARGIN + FOOTER_H) this.newPage(this.cur.w > this.cur.h);
  }

  heading(text: string, size = 12) {
    this.ensure(size + 40);
    this.cur.page.drawText(text, { x: MARGIN, y: this.y - size, size, font: this.bold, color: DARK });
    this.y -= size + 8;
  }

  note(text: string, size = 8, color = GREY) {
    const lines = wrap(text, this.font, size, this.contentW);
    for (const l of lines) {
      this.ensure(size + 4);
      this.cur.page.drawText(l, { x: MARGIN, y: this.y - size, size, font: this.font, color });
      this.y -= size + 3;
    }
    this.y -= 3;
  }

  /** Tabela z powtarzanym nagłówkiem. widths — względne wagi kolumn. */
  table(
    heads: string[],
    weights: number[],
    rows: string[][],
    opts: { size?: number; align?: ('l' | 'r' | 'c')[]; minRowH?: number } = {},
  ) {
    const size = opts.size ?? (this.cur.w > this.cur.h ? 8 : 8.5);
    const lineH = size + 3;
    const total = weights.reduce((a, b) => a + b, 0);
    const pad = 3;

    // Kolumna nie może być węższa niż najdłuższe słowo jej nagłówka (bez łamania słów w środku).
    // Jeśli któraś jest za wąska — dostaje minimum, a pozostałe kolumny oddają szerokość proporcjonalnie.
    const minW = heads.map((h) => {
      const longest = Math.max(0, ...h.split(/\s+/).map((w) => this.bold.widthOfTextAtSize(w, size)));
      return longest + pad * 2 + 1;
    });
    let widths = weights.map((w) => (w / total) * this.contentW);
    for (let pass = 0; pass < 4; pass++) {
      const fixed = widths.map((w, i) => w < minW[i]);
      if (!fixed.some(Boolean)) break;
      const fixedSum = widths.reduce((s, w, i) => s + (fixed[i] ? minW[i] : 0), 0);
      const flexTotal = weights.reduce((s, w, i) => s + (fixed[i] ? 0 : w), 0);
      const room = this.contentW - fixedSum;
      if (flexTotal <= 0 || room <= 0) break;
      widths = widths.map((w, i) => (fixed[i] ? minW[i] : (weights[i] / flexTotal) * room));
    }

    const rowHeight = (cells: string[], f: PDFFont) =>
      Math.max(
        opts.minRowH ?? 0,
        Math.max(...cells.map((c, i) => wrap(c, f, size, widths[i] - pad * 2).length)) * lineH + 5,
      );

    const drawHead = () => {
      const h = rowHeight(heads, this.bold);
      this.ensure(h + 20);
      const { page } = this.cur;
      page.drawRectangle({ x: MARGIN, y: this.y - h, width: this.contentW, height: h, color: HEAD_BG });
      let x = MARGIN;
      heads.forEach((t, i) => {
        wrap(t, this.bold, size, widths[i] - pad * 2).forEach((ln, li) =>
          page.drawText(ln, { x: x + pad, y: this.y - size - 2 - li * lineH, size, font: this.bold, color: DARK }),
        );
        x += widths[i];
      });
      this.y -= h;
    };

    // Nagłówek + pierwszy wiersz muszą zmieścić się razem, inaczej nowa strona.
    const firstH = rows.length ? rowHeight(rows[0], this.font) : 0;
    this.ensure(rowHeight(heads, this.bold) + firstH + 6);
    drawHead();

    rows.forEach((cells) => {
      const h = rowHeight(cells, this.font);
      if (this.y - h < MARGIN + FOOTER_H) {
        this.newPage(this.cur.w > this.cur.h);
        drawHead();
      }
      const { page } = this.cur;
      let x = MARGIN;
      cells.forEach((t, i) => {
        const al = opts.align?.[i] ?? 'l';
        wrap(t, this.font, size, widths[i] - pad * 2).forEach((ln, li) => {
          const lw = this.font.widthOfTextAtSize(ln, size);
          const tx = al === 'r' ? x + widths[i] - pad - lw : al === 'c' ? x + (widths[i] - lw) / 2 : x + pad;
          page.drawText(ln, { x: tx, y: this.y - size - 2 - li * lineH, size, font: this.font, color: DARK });
        });
        x += widths[i];
      });
      page.drawLine({
        start: { x: MARGIN, y: this.y - h },
        end: { x: MARGIN + this.contentW, y: this.y - h },
        thickness: 0.4,
        color: LIGHT,
      });
      this.y -= h;
    });
    this.y -= 10;
  }

  // ---------------------------------------------------------------------

  tableSection(def: SectionDef, rows: Record<string, any>[], blankRows?: number) {
    const cols = def.columns ?? [];
    const landscape = orientationFor(cols) === 'landscape';
    this.startSectionPage(landscape, def);
    this.heading(def.title.toUpperCase(), 11);
    const heads = ['Lp.', ...cols.map((c) => (c.unit ? `${c.label} [${c.unit}]` : c.label))];
    const weights = [0.35, ...cols.map((c) => c.w ?? 1)];
    const body: string[][] = [];
    if (blankRows) {
      for (let i = 0; i < blankRows; i++) body.push([String(i + 1), ...cols.map(() => '')]);
    } else {
      rows.forEach((r, i) => body.push([String(i + 1), ...cols.map((c) => fmtCell(c, r[c.key]))]));
    }
    // Pusty formularz: wyższe wiersze, żeby dało się pisać długopisem.
    this.table(heads, weights, body, blankRows ? { minRowH: 24 } : {});
    if (!blankRows) {
      const basis = rows.map((r) => r.criterionBasis).find((b) => b);
      if (basis && cols.some((c) => c.computed)) this.note(`Podstawa kryterium (Ia, wymagane Zs): ${basis}`);
      else if (cols.some((c) => c.computed) && rows.some((r) => r.zsRequired != null)) {
        this.note('Kryterium wyliczono ze współczynników skonfigurowanych przez administratora.');
      }
    }
  }

  checklistSection(def: SectionDef, items: any[], blank = false) {
    this.startSectionPage(false, def);
    this.heading(def.title.toUpperCase(), 11);
    const list = blank
      ? (def.items ?? []).map((label) => ({ label }))
      : items.filter((i) => i && (i.state || i.note || i.label));
    const body = list.map((i: any, n: number) => [String(n + 1), i.label ?? '', blank ? '' : stateLabel(i.state), blank ? '' : i.note ?? '']);
    if (blank) {
      for (let k = 0; k < 3; k++) body.push([String(body.length + 1), '', '', '']);
    }
    this.table(['Lp.', 'Pozycja', 'OK / NIE / N/D', 'Uwagi'], [0.4, 3, 1.2, 3], body);
  }

  lightningSection(def: SectionDef, block: any, blank = false) {
    this.startSectionPage(false, def);
    this.heading(def.title.toUpperCase(), 11);
    if (!blank) {
      this.note(block?.present ? 'Instalacja odgromowa występuje.' : 'Nie dotyczy.', 9, DARK);
      if (!block?.present) return;
    }
    const items = blank ? (def.items ?? []).map((label) => ({ label })) : block?.items ?? [];
    const body = items
      .filter((i: any) => blank || i.state || i.note || i.label)
      .map((i: any, n: number) => [String(n + 1), i.label ?? '', blank ? '' : stateLabel(i.state), blank ? '' : i.note ?? '']);
    this.table(['Lp.', 'Pozycja', 'OK / NIE / N/D', 'Uwagi'], [0.4, 3, 1.2, 3], body);
    const earth = blank ? '' : block?.earthingResistance;
    this.table(['Parametr', 'Wartość'], [2, 3], [
      ['Rezystancja uziemienia [Ω]', blank ? '' : earth != null ? String(earth) : ''],
      ['Uwagi', blank ? '' : block?.notes ?? ''],
    ]);
  }

  fieldsSection(def: SectionDef, data: Record<string, any>) {
    const own = data?.[def.key] ?? {};
    const customBlock = data?.custom?.[def.key] ?? {};
    const rows: string[][] = [];
    for (const f of def.fields ?? []) {
      const v = own[f.key];
      if (v === null || v === undefined || String(v).trim() === '' || v === false) continue;
      rows.push([f.label + (f.unit ? ` [${f.unit}]` : ''), typeof v === 'boolean' ? 'Tak' : String(v)]);
    }
    for (const cf of (this.input.customFields ?? []).filter((c) => c.sectionKey === def.key && c.type !== 'table')) {
      const v = customBlock[cf.key];
      if (v === null || v === undefined || String(v).trim() === '' || v === false) continue;
      const shown = cf.type === 'checkbox' ? 'Tak' : cf.type === 'date' ? formatPlDate(v) : String(v);
      rows.push([cf.label + (cf.unit ? ` [${cf.unit}]` : ''), shown]);
    }
    if (!rows.length) return;
    this.startSectionPage(false, def);
    this.heading(def.title.toUpperCase(), 11);
    this.table(['Pole', 'Wartość'], [2, 3], rows);
  }

  extrasSection(def: SectionDef, block: any) {
    const on = EXTRAS_FLAGS.filter((f) => block?.[f.key] === true).map((f) =>
      f.key === 'other' && block?.otherName ? `Inne: ${block.otherName}` : f.label,
    );
    if (!on.length) return;
    this.startSectionPage(false, def);
    this.heading(def.title.toUpperCase(), 11);
    this.table(['Występujące instalacje'], [1], on.map((t) => [t]));
  }

  conclusionsSection(def: SectionDef, block: any) {
    this.startSectionPage(false, def);
    this.heading(def.title.toUpperCase(), 11);
    const rating = FINAL_RATINGS.find((r) => r.value === block?.finalRating)?.label ?? '';
    if (block?.text) this.table(['Wnioski i zalecenia'], [1], [[String(block.text)]]);
    if (rating) {
      this.table(['Ocena końcowa'], [1], [[rating + (block?.ratingConfirmedAt ? ` (zatwierdzona ${formatPlDate(block.ratingConfirmedAt)})` : '')]]);
    }
  }

  private startSectionPage(landscape: boolean, def: SectionDef) {
    // Tabele szerokie wymagają poziomej strony; zmiana orientacji = nowa strona.
    // W trybie BLANK każda sekcja zaczyna się od nowej strony (formularz do wypełnienia w terenie).
    const curLandscape = this.cur ? this.cur.w > this.cur.h : false;
    const forceNew = this.input.mode === 'BLANK';
    if (!this.cur || curLandscape !== landscape || forceNew) {
      this.newPage(landscape);
    } else {
      this.y -= 4;
    }
  }

  async imageGrid(title: string, items: PdfImage[]) {
    if (!items.length) return;
    this.heading(title, 10);
    const perRow = this.cur.w > this.cur.h ? 4 : 3;
    const gap = 10;
    const cellW = (this.contentW - gap * (perRow - 1)) / perRow;
    const cellH = cellW * 0.75;
    for (let i = 0; i < items.length; i += perRow) {
      const rowItems = items.slice(i, i + perRow);
      this.ensure(cellH + 24);
      for (let k = 0; k < rowItems.length; k++) {
        const it = rowItems[k];
        try {
          const img = it.kind === 'png' ? await this.doc.embedPng(it.bytes) : await this.doc.embedJpg(it.bytes);
          const s = img.scaleToFit(cellW, cellH);
          const x = MARGIN + k * (cellW + gap);
          this.cur.page.drawImage(img, { x, y: this.y - s.height, width: s.width, height: s.height });
          this.cur.page.drawText(ellipsize(it.caption, this.font, 7, cellW), {
            x,
            y: this.y - cellH - 9,
            size: 7,
            font: this.font,
            color: GREY,
          });
        } catch {
          /* uszkodzone zdjęcie pomijamy — reszta dokumentu ma się wygenerować */
        }
      }
      this.y -= cellH + 20;
    }
  }

  async signatures(showBlank: boolean) {
    const sigs = this.input.signatures ?? [];
    if (!this.cur) this.newPage(false);
    this.ensure(190);
    this.heading('PODPISY', 11);
    const roles: { role: 'PERFORMER' | 'REPRESENTATIVE'; title: string; qual: boolean }[] = [
      { role: 'PERFORMER', title: 'Osoba wykonująca badanie', qual: true },
      { role: 'REPRESENTATIVE', title: 'Przedstawiciel właściciela / zarządcy', qual: false },
    ];
    const colW = (this.contentW - 20) / 2;
    const top = this.y;
    for (let i = 0; i < roles.length; i++) {
      const r = roles[i];
      const sig = sigs.find((s) => s.role === r.role);
      const x = MARGIN + i * (colW + 20);
      let y = top;
      const p = this.cur.page;
      p.drawText(r.title, { x, y: y - 10, size: 9.5, font: this.bold, color: DARK });
      y -= 26;
      if (sig) {
        p.drawText(`Imię i nazwisko: ${sig.name}`, { x, y: y - 8, size: 8.5, font: this.font, color: DARK });
        y -= 14;
        if (r.qual && sig.qualifications) {
          for (const l of wrap(`Uprawnienia: ${sig.qualifications}`, this.font, 8.5, colW)) {
            p.drawText(l, { x, y: y - 8, size: 8.5, font: this.font, color: DARK });
            y -= 12;
          }
        }
        if (sig.image) {
          try {
            const img = sig.image.kind === 'png' ? await this.doc.embedPng(sig.image.bytes) : await this.doc.embedJpg(sig.image.bytes);
            const s = img.scaleToFit(colW - 10, 56);
            p.drawImage(img, { x, y: y - s.height - 2, width: s.width, height: s.height });
            y -= s.height + 6;
          } catch {
            y -= 6;
          }
        }
        const at = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(sig.signedAt);
        p.drawText('Dokument podpisany elektronicznie w systemie P-Troy', { x, y: y - 8, size: 7.5, font: this.font, color: GREEN });
        y -= 12;
        p.drawText(`Data i godzina: ${at}`, { x, y: y - 8, size: 7.5, font: this.font, color: GREY });
      } else if (showBlank) {
        const line = (label: string) => {
          p.drawText(`${label}:`, { x, y: y - 8, size: 8.5, font: this.font, color: DARK });
          const lw = this.font.widthOfTextAtSize(`${label}: `, 8.5);
          p.drawLine({ start: { x: x + lw + 2, y: y - 9 }, end: { x: x + colW, y: y - 9 }, thickness: 0.5, color: GREY });
          y -= 24;
        };
        line('Imię i nazwisko');
        if (r.qual) line('Uprawnienia');
        line('Podpis');
        line('Data');
      } else {
        p.drawText('Brak podpisu', { x, y: y - 8, size: 8.5, font: this.font, color: GREY });
      }
    }
    this.y = top - 150;
  }

  /** Stopka, numeracja „Strona i / n” (u góry po prawej i w stopce), znak wodny. */
  finish() {
    const n = this.pages.length;
    this.pages.forEach(({ page, w, h }, idx) => {
      const label = `Strona ${idx + 1} / ${n}`;
      const lw = this.font.widthOfTextAtSize(label, 8.5);
      page.drawText(label, { x: w - MARGIN - lw, y: h - MARGIN - 24, size: 8.5, font: this.bold, color: DARK });
      page.drawText(
        ellipsize(`${this.input.number} · wersja ${this.input.version} · wygenerowano ${this.input.generatedAt}`, this.font, 7, w - MARGIN * 2 - 70),
        { x: MARGIN, y: MARGIN - 4, size: 7, font: this.font, color: GREY },
      );
      page.drawText(label, { x: w - MARGIN - lw, y: MARGIN - 4, size: 7, font: this.font, color: GREY });

      if (!this.input.approved && !this.input.isOldMeasurement) {
        const text = 'WERSJA ROBOCZA';
        const size = 68;
        const tw = this.bold.widthOfTextAtSize(text, size);
        const ang = 35;
        const rad = (ang * Math.PI) / 180;
        page.drawText(text, {
          x: w / 2 - (tw / 2) * Math.cos(rad),
          y: h / 2 - (tw / 2) * Math.sin(rad),
          size,
          font: this.bold,
          color: rgb(0.85, 0.85, 0.85),
          rotate: degrees(ang),
          opacity: 0.45,
        });
      }
    });
  }
}

// ---------------------------------------------------------------------------

@Injectable()
export class ProtocolPdfService {
  constructor(private readonly storage: FileStorageService) {}

  /** Sam generator bajtów — bez zapisu. Dzięki temu da się go testować bez MinIO. */
  async renderBytes(input: ProtocolPdfInput): Promise<Uint8Array> {
    const b = new Builder(input);
    await b.init();

    if (input.mode === 'FULL') {
      b.newPage(false);
      await this.renderFull(b, input);
    } else if (input.mode === 'MEASUREMENTS') {
      // Pierwsza strona od razu w orientacji pierwszej tabeli (bez prawie pustej strony z samym nagłówkiem).
      const first = input.sections.find((s) => s.kind === 'table');
      b.newPage(first ? orientationFor(first.columns) === 'landscape' : false);
      await this.renderMeasurements(b, input);
    } else {
      // BLANK: strony tworzy każda sekcja (startSectionPage), bez pustej strony otwierającej.
      await this.renderBlank(b, input);
    }

    if (b.pages.length === 0) b.newPage(false);
    b.finish();
    return b.doc.save();
  }

  async render(input: ProtocolPdfInput, key: string): Promise<{ pdfPath: string }> {
    const bytes = await this.renderBytes(input);
    await this.storage.saveDocumentAtKey(Buffer.from(bytes), key);
    return { pdfPath: key };
  }

  private renderSection(b: Builder, def: SectionDef, input: ProtocolPdfInput) {
    const data = input.data ?? {};
    if (def.isCustom) {
      const block = data?.custom?.[def.key] ?? {};
      if (def.columns?.length) b.tableSection(def, meaningfulRows(block.rows));
      else b.fieldsSection({ ...def, fields: [] }, data);
      return;
    }
    switch (def.kind) {
      case 'fields':
        return b.fieldsSection(def, data);
      case 'table':
        return b.tableSection(def, meaningfulRows(data?.[def.key]));
      case 'checklist':
        return b.checklistSection(def, data?.[def.key]?.items ?? []);
      case 'lightning':
        return b.lightningSection(def, data?.[def.key]);
      case 'extras':
        return b.extrasSection(def, data?.[def.key]);
      case 'conclusions':
        return b.conclusionsSection(def, data?.[def.key]);
    }
  }

  private async renderFull(b: Builder, input: ProtocolPdfInput) {
    const d = input.details ?? {};
    b.heading('PROTOKÓŁ KONTROLI I POMIARÓW INSTALACJI ELEKTRYCZNEJ', 13);
    const info: string[][] = [
      ['Numer protokołu', `${input.number} (wersja ${input.version})`],
      ['Rodzaj kontroli', d.inspectionKindLabel ?? ''],
      ['Data wykonania', input.header.dateLabel],
      ['Rozpoczęcie badań', d.startedAt ?? ''],
      ['Zakończenie badań', d.finishedAt ?? ''],
      ['Typ obiektu', input.header.objectTypeLabel],
      ['Obiekt', input.header.objectName],
      ['Adres', input.header.address],
      ...(d.client ?? []).map((c) => [c.label, c.value]),
      ...(d.performer ?? []).map((c) => [c.label, c.value]),
      ['Termin kolejnego badania', d.nextInspectionDate ?? ''],
    ].filter((r) => r[1]);
    b.table(['Dane protokołu', ''], [2, 4], info);

    for (const def of input.sections) {
      this.renderSection(b, def, input);
      if (def.key === 'defects') {
        const photos = (input.images ?? []).filter((i) => i.fieldKey?.startsWith('defects:'));
        await b.imageGrid('Zdjęcia usterek (przed / po usunięciu)', photos);
      }
    }

    const general = (input.images ?? []).filter((i) => !i.fieldKey?.startsWith('defects:'));
    await b.imageGrid('Zdjęcia i załączniki graficzne', general);
    if (input.attachmentNames?.length) {
      b.heading('Pozostałe załączniki', 10);
      b.table(['Lp.', 'Plik'], [0.4, 6], input.attachmentNames.map((n, i) => [String(i + 1), n]));
    }
    await b.signatures(false);
  }

  private async renderMeasurements(b: Builder, input: ProtocolPdfInput) {
    this.noteBanner(b, input);
    for (const def of input.sections) this.renderSection(b, def, input);
    await b.signatures(true);
  }

  private noteBanner(b: Builder, input: ProtocolPdfInput) {
    b.note('Wydruk zawiera dane zapisane w protokole na moment generowania dokumentu.', 8);
    b.note(input.approved ? 'PROTOKÓŁ ZATWIERDZONY' : 'WERSJA ROBOCZA', 9, input.approved ? GREEN : rgb(0.75, 0.2, 0.1));
  }

  private async renderBlank(b: Builder, input: ProtocolPdfInput) {
    const rows = Math.max(1, Math.min(input.blankRows ?? 20, 500));
    for (const def of input.sections) {
      if (def.kind === 'table') b.tableSection(def, [], rows);
      else if (def.kind === 'checklist') b.checklistSection(def, [], true);
      else if (def.kind === 'lightning') b.lightningSection(def, null, true);
    }
    await b.signatures(true);
  }
}
