import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { PlanSummary } from './plan-logic';

const DEJAVU_SANS_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const DEJAVU_SANS_BOLD_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

// Wiersz tabeli: każda komórka to lista linii (puszki ramki pod sobą, jak w Strefie Elektryki)
export interface PdfPointRow {
  code: string;
  kind: string;
  details: string[];
  circuits: string[];
  lines: string[];
  smart: string[];
  boxes: string[];
  note: string;
}
export interface PdfPlanGroup { title: string; rows: PdfPointRow[] }

const PAGE_W = 842; // A4 poziomo
const PAGE_H = 595;
const MARGIN = 28;
const FONT = 7;
const LINE_H = 9;
const PAD = 3;
// Lp, Numer, Rodzaj, Szczegóły, Obwód, Linie, Smart, Puszka, Uwagi
const COLS = [22, 46, 88, 148, 148, 58, 44, 110, 92];
const HEAD = ['Lp.', 'Numer', 'Rodzaj', 'Szczegóły', 'Obwód', 'Linie', 'Smart', 'Puszka', 'Uwagi'];

function wrap(text: string, font: any, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      // pojedyncze bardzo długie słowo łamiemy znakami
      while (font.widthOfTextAtSize(w, size) > maxW && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxW) cut--;
        if (cur) { out.push(cur); cur = ''; }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const cand = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) > maxW && cur) { out.push(cur); cur = w; } else { cur = cand; }
    }
    out.push(cur);
  }
  return out.length ? out : [''];
}

@Injectable()
export class PlanPointsPdfService {
  constructor(private readonly storage: FileStorageService) {}

  async render(params: {
    jobKey: string;
    siteName: string;
    generatedAt: string;
    groups: PdfPlanGroup[];
    summary: PlanSummary;
  }): Promise<{ pdfPath: string }> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fs.readFileSync(DEJAVU_SANS_PATH));
    const bold = await doc.embedFont(fs.readFileSync(DEJAVU_SANS_BOLD_PATH));
    const dark = rgb(0.1, 0.1, 0.1);
    const grey = rgb(0.45, 0.45, 0.45);
    const lineCol = rgb(0.7, 0.7, 0.7);

    let page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    // --- nagłówek dokumentu ---
    page.drawText('Lista punktów instalacji elektrycznej', { x: MARGIN, y: y - 14, size: 16, font: bold, color: dark });
    y -= 30;
    page.drawText(`BUDOWA: ${params.siteName}`, { x: MARGIN, y: y - 9, size: 9, font: bold, color: dark });
    y -= 13;
    page.drawText(`Wygenerowano: ${params.generatedAt}`, { x: MARGIN, y: y - 8, size: 8, font, color: grey });
    y -= 20;

    const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
    const colX = (i: number) => MARGIN + COLS.slice(0, i).reduce((a, b) => a + b, 0);
    const tableW = COLS.reduce((a, b) => a + b, 0);

    const drawHeader = () => {
      const h = 14;
      page.drawRectangle({ x: MARGIN, y: y - h, width: tableW, height: h, color: rgb(0.93, 0.93, 0.93), borderColor: lineCol, borderWidth: 0.5 });
      HEAD.forEach((t, i) => page.drawText(t, { x: colX(i) + PAD, y: y - 10, size: FONT, font: bold, color: dark }));
      y -= h;
    };

    for (const group of params.groups) {
      if (y < MARGIN + 60) newPage();
      page.drawText(group.title, { x: MARGIN, y: y - 10, size: 10, font: bold, color: dark });
      y -= 16;
      drawHeader();

      group.rows.forEach((row, idx) => {
        const cells: string[][] = [
          [String(idx + 1) + '.'],
          [row.code],
          row.kind.split('\n'),
          row.details,
          row.circuits,
          row.lines,
          row.smart,
          row.boxes,
          row.note ? [row.note] : [''],
        ];
        const wrapped = cells.map((c, i) => c.flatMap((t) => wrap(t, i === 1 ? bold : font, FONT, COLS[i] - PAD * 2)));
        const nLines = Math.max(...wrapped.map((w) => w.length));
        const rowH = nLines * LINE_H + PAD * 2;

        if (y - rowH < MARGIN + 14) { newPage(); drawHeader(); }
        page.drawRectangle({ x: MARGIN, y: y - rowH, width: tableW, height: rowH, borderColor: lineCol, borderWidth: 0.5 });
        wrapped.forEach((lines, i) => {
          if (i > 0) page.drawLine({ start: { x: colX(i), y }, end: { x: colX(i), y: y - rowH }, thickness: 0.4, color: lineCol });
          lines.forEach((t, li) => page.drawText(t, { x: colX(i) + PAD, y: y - PAD - FONT - li * LINE_H + 1, size: FONT, font: i === 1 ? bold : font, color: dark }));
        });
        y -= rowH;
      });
      y -= 14;
    }

    if (params.groups.every((g) => g.rows.length === 0)) {
      page.drawText('Na rzutach nie naniesiono jeszcze żadnych punktów.', { x: MARGIN, y: y - 10, size: 9, font, color: grey });
    }

    // --- zestawienie (automatyczne zliczanie) ---
    newPage();
    page.drawText('Zestawienie punktów i osprzętu', { x: MARGIN, y: y - 14, size: 14, font: bold, color: dark });
    y -= 30;
    page.drawText(`Łącznie punktów na rzutach: ${params.summary.total}`, { x: MARGIN, y: y - 9, size: 9, font: bold, color: dark });
    y -= 16;
    if (params.summary.noCircuit > 0) {
      page.drawText(`Do uzupełnienia: ${params.summary.noCircuit} gniazd/lamp/rolet/łączników bez przypisanego obwodu`, { x: MARGIN, y: y - 8, size: 8, font, color: rgb(0.6, 0.1, 0.1) });
      y -= 16;
    }
    const section = (title: string, rows: { label: string; count: number }[]) => {
      if (rows.length === 0) return;
      if (y < MARGIN + 40) newPage();
      page.drawText(title, { x: MARGIN, y: y - 10, size: 10, font: bold, color: dark });
      y -= 16;
      for (const r of rows) {
        const lines = wrap(r.label, font, 8.5, 560);
        if (y - lines.length * 11 < MARGIN) newPage();
        lines.forEach((t, i) => page.drawText(t, { x: MARGIN + 6, y: y - 9 - i * 11, size: 8.5, font, color: dark }));
        page.drawText(`${r.count} szt.`, { x: MARGIN + 620, y: y - 9, size: 8.5, font: bold, color: dark });
        y -= lines.length * 11 + 2;
        page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: MARGIN + 700, y: y + 1 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
      }
      y -= 10;
    };
    section('Punkty (gniazda, oświetlenie, czujniki, ...)', params.summary.points);
    section('Ramki na osprzęt', params.summary.frames);
    section('Osprzęt w ramkach (łączniki, gniazda)', params.summary.devices);
    section('Puszki', params.summary.boxes);

    // --- numeracja stron ---
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      p.drawText('Dokument wygenerowano w P-Troy ERP', { x: MARGIN, y: 14, size: 7, font, color: grey });
      const t = `Strona ${i + 1} z ${pages.length}`;
      p.drawText(t, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(t, 7), y: 14, size: 7, font, color: grey });
    });

    const bytes = await doc.save();
    const key = `plans/points-lists/${params.jobKey}.pdf`;
    await this.storage.saveDocumentAtKey(Buffer.from(bytes), key);
    return { pdfPath: key };
  }
}
