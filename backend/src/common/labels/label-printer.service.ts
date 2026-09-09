import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, LineCapStyle } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';
import { FileStorageService } from '../storage/file-storage.service';

// Czcionki bazowe pdf-lib (Helvetica itd.) używają kodowania WinAnsi,
// które NIE obsługuje polskich znaków diakrytycznych (ą, ć, ę, ł, ń, ó,
// ś, ź, ż) — próba narysowania takiego tekstu rzuca błędem w trakcie
// renderowania. Dla generycznego systemu etykiet (moduł label-templates,
// gdzie pola pochodzą z dowolnych danych — nazw budów, opisów, itd.)
// osadzamy zamiast tego prawdziwą czcionkę TrueType (DejaVu Sans) przez
// fontkit, która ma pełne pokrycie Unicode/Latin Extended-A.
const DEJAVU_SANS_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const DEJAVU_SANS_BOLD_PATH = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

// Przycina tekst do jednej linii tak, żeby zmieścił się w maxWidth przy
// danej czcionce/rozmiarze — dopisuje "…" jeśli musiał skrócić. Używane
// zamiast automatycznego zawijania pdf-lib (które łamie na wiele linii
// i psuje układ na małych etykietach — patrz drawLabelPage).
function truncateToWidth(text: string, font: any, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  const ellipsis = '…';
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(result + ellipsis, fontSize) > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + ellipsis;
}

// Dobiera największy rozmiar czcionki (nie większy niż baseFontSize),
// przy którym cały tekst zmieści się w jednej linii o szerokości
// maxWidth — próbuje zmniejszać w dół do 55% zanim w ostateczności
// przytnie tekst. Dzięki temu np. dłuższa nazwa rozdzielni obok kodu QR
// dostaje mniejszą, ale wciąż w pełni czytelną czcionkę, zamiast od
// razu urywać się jako "Rozdzie…".
function fitTextToWidth(text: string, font: any, baseFontSize: number, maxWidth: number): { text: string; fontSize: number } {
  const minFontSize = Math.max(5, baseFontSize * 0.55);
  let fontSize = baseFontSize;
  while (fontSize > minFontSize && font.widthOfTextAtSize(text, fontSize) > maxWidth) {
    fontSize -= 0.5;
  }
  return { text: truncateToWidth(text, font, fontSize, maxWidth), fontSize };
}

/**
 * Renderuje etykietę 60x40mm gotową do wydruku na drukarce etykiet
 * (np. Zebra/Brother). QR generowany przez `qrcode`, kody kreskowe
 * (EAN-13 / Code128) przez `bwip-js`.
 */
@Injectable()
export class LabelPrinterService {
  constructor(private readonly storage: FileStorageService) {}

  async render(code: {
    id: string;
    value: string;
    symbology: 'QR' | 'EAN_13' | 'CODE_128';
    product?: { name: string; catalogNumber?: string | null } | null;
    tool?: { name: string } | null;
    vehicle?: { registrationNumber: string } | null;
  }) {
    const label = code.product?.name || code.tool?.name || code.vehicle?.registrationNumber || code.value;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([170, 113]); // ~60x40mm w punktach (72dpi)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const codeImageBytes = await this.renderCodeImage(code.value, code.symbology);
    const image = await pdfDoc.embedPng(codeImageBytes);
    const dims = image.scaleToFit(90, 90);
    page.drawImage(image, { x: 8, y: 113 - dims.height - 8, width: dims.width, height: dims.height });

    page.drawText(label.slice(0, 40), {
      x: 8,
      y: 12,
      size: 8,
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: 154,
    });

    const pdfBytes = await pdfDoc.save();
    const key = `labels/${code.id}.pdf`;
    await this.storage.saveDocumentAtKey(Buffer.from(pdfBytes), key);
    return { pdfPath: key };
  }

  private async renderCodeImage(value: string, symbology: 'QR' | 'EAN_13' | 'CODE_128'): Promise<Buffer> {
    if (symbology === 'QR') {
      return QRCode.toBuffer(value, { type: 'png', margin: 1, width: 300 });
    }
    return bwipjs.toBuffer({
      bcid: symbology === 'EAN_13' ? 'ean13' : 'code128',
      text: value,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });
  }

  // -------------------------------------------------------------------
  // CENTRALNY SYSTEM ETYKIET (moduł `labels`) — generator wspólny dla
  // Rack/LAN, Rozdzielni i przyszłych modułów. Renderuje dowolny
  // LabelTemplate (rozmiar + uporządkowana lista pól + opcjonalny QR)
  // z danymi dostarczonymi przez LabelDataProvider danego modułu.
  // Celowo w TYM SAMYM serwisie co render() dla InventoryCode, żeby nie
  // duplikować logiki PDF/QR — różni się tylko układ (dynamiczna lista
  // pól zamiast stałego layoutu kodu magazynowego).
  // -------------------------------------------------------------------

  private mmToPt(mm: number): number {
    return mm * 2.83465;
  }

  /**
   * Renderuje PDF gotowy do podglądu/wydruku przez przeglądarkę — jedna
   * strona na etykietę, żeby jedno zlecenie (nawet wydruk masowy wielu
   * aparatów naraz) trafiło do przeglądarki jako jeden dokument.
   */
  async renderJobPdf(params: {
    jobId: string;
    widthMm: number;
    heightMm: number;
    pages: { lines: { text: string; bold?: boolean }[]; qrContent?: string }[];
  }): Promise<{ pdfPath: string }> {
    const w = this.mmToPt(params.widthMm);
    const h = this.mmToPt(params.heightMm);
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(fs.readFileSync(DEJAVU_SANS_PATH));
    const fontBold = await pdfDoc.embedFont(fs.readFileSync(DEJAVU_SANS_BOLD_PATH));

    for (const p of params.pages) {
      await this.drawLabelPage(pdfDoc, w, h, p.lines, font, fontBold, p.qrContent);
    }

    const pdfBytes = await pdfDoc.save();
    const key = `labels/print-jobs/${params.jobId}.pdf`;
    await this.storage.saveDocumentAtKey(Buffer.from(pdfBytes), key);
    return { pdfPath: key };
  }

  private async drawLabelPage(
    pdfDoc: PDFDocument,
    w: number,
    h: number,
    lines: { text: string; bold?: boolean }[],
    font: any,
    fontBold: any,
    qrContent?: string,
  ) {
    const margin = 6;
    const page = pdfDoc.addPage([w, h]);
    let textStartX = margin;
    let textWidth = w - margin * 2;

    if (qrContent) {
      const qrBytes = await QRCode.toBuffer(qrContent, { type: 'png', margin: 0, width: 300 });
      const qrImage = await pdfDoc.embedPng(qrBytes);
      const qrSize = Math.min(h - margin * 2, w * 0.32);
      page.drawImage(qrImage, { x: w - margin - qrSize, y: (h - qrSize) / 2, width: qrSize, height: qrSize });
      textWidth = w - margin * 2 - qrSize - 6;
    }

    const visibleLines = lines.filter((l) => l.text && l.text.trim().length > 0).slice(0, 6);
    const lineCount = Math.max(visibleLines.length, 1);
    const fontSize = Math.max(6, Math.min(18, (h - margin * 2) / lineCount - 2));
    const lineHeight = (h - margin * 2) / lineCount;

    visibleLines.forEach((line, i) => {
      const activeFont = line.bold ? fontBold : font;
      // Celowo BEZ zawijania tekstu (bez maxWidth w drawText) — na tak
      // małej etykiecie każde pole ma stałą, jedną linię wysokości;
      // pdf-lib z maxWidth łamałby zbyt długi tekst na 2+ linie wizualne,
      // co nachodziło na sąsiednie pola (były policzone tylko na 1 linię
      // każde). Zamiast tego zmniejszamy czcionkę tak, żeby cały tekst
      // zmieścił się w jednej linii — a dopiero w ostateczności przycinamy.
      const fit = fitTextToWidth(line.text, activeFont, fontSize, textWidth);
      const y = h - margin - lineHeight * (i + 1) + (lineHeight - fit.fontSize) / 2;
      page.drawText(fit.text, {
        x: textStartX,
        y: Math.max(y, margin),
        size: fit.fontSize,
        font: activeFont,
        color: rgb(0.05, 0.05, 0.05),
      });
    });
  }

  /**
   * Generuje ZPL (Zebra Programming Language) dla tej samej etykiety —
   * do wysłania przez P-Troy Print Agent bezpośrednio na drukarkę
   * sieciową (raw socket, port 9100). Zakłada rozdzielczość 203dpi
   * (8 dotów/mm) — standard dla większości stołowych drukarek Zebra.
   * Zwraca JEDEN ciąg ZPL zawierający wszystkie etykiety zlecenia
   * (drukarki ZPL przyjmują wiele ^XA...^XZ w jednym strumieniu).
   */
  renderJobZpl(params: {
    widthMm: number;
    heightMm: number;
    pages: { lines: { text: string; bold?: boolean }[]; qrContent?: string }[];
  }): string {
    return params.pages.map((p) => this.renderTemplateZpl({ widthMm: params.widthMm, heightMm: params.heightMm, lines: p.lines, qrContent: p.qrContent })).join('\n');
  }

  /**
   * Generuje ZPL dla POJEDYNCZEJ etykiety — wywoływane przez renderJobZpl
   * dla każdej strony zlecenia z osobna.
   */
  renderTemplateZpl(params: {
    widthMm: number;
    heightMm: number;
    lines: { text: string; bold?: boolean }[];
    qrContent?: string;
  }): string {
    const DOTS_PER_MM = 8;
    const widthDots = Math.round(params.widthMm * DOTS_PER_MM);
    const heightDots = Math.round(params.heightMm * DOTS_PER_MM);
    const margin = 12;

    const visibleLines = params.lines.filter((l) => l.text && l.text.trim().length > 0).slice(0, 6);
    const lineCount = Math.max(visibleLines.length, 1);
    const textAreaWidth = params.qrContent ? widthDots - margin * 2 - Math.round(heightDots * 0.6) : widthDots - margin * 2;
    const lineHeight = Math.floor((heightDots - margin * 2) / lineCount);
    const fontSize = Math.max(18, Math.min(40, lineHeight - 6));

    // ^CI28 = kodowanie UTF-8 — bez tego większość drukarek Zebra
    // wypisze polskie znaki diakrytyczne jako krzaki (domyślny codepage
    // ZPL to Latin-1/uproszczony, nie UTF-8)
    let zpl = `^XA\n^CI28\n^PW${widthDots}\n^LL${heightDots}\n`;

    visibleLines.forEach((line, i) => {
      const y = margin + lineHeight * i;
      const font = line.bold ? '0' : '0'; // ^A0N — font wbudowany skalowalny
      zpl += `^FO${margin},${y}^A${font}N,${fontSize},${fontSize}^FB${textAreaWidth},1,0,L,0^FD${this.escapeZpl(line.text)}^FS\n`;
    });

    if (params.qrContent) {
      const qrX = widthDots - margin - Math.round(heightDots * 0.55);
      zpl += `^FO${qrX},${margin}^BQN,2,5^FDQA,${this.escapeZpl(params.qrContent)}^FS\n`;
    }

    zpl += '^XZ\n';
    return zpl;
  }

  private escapeZpl(text: string): string {
    // ZPL traktuje ^ i ~ jako znaki sterujące — usuwamy je z treści etykiety
    return text.replace(/[\^~]/g, '').slice(0, 80);
  }

  // -------------------------------------------------------------------
  // PASEK DIN — ponumerowane moduły z ikoną i opisem + tabela grupowania
  // obwodów pod wyłącznikami różnicowoprądowymi (RCD). Osobny, wyspecja-
  // lizowany układ tylko dla aparatów w rozdzielni (DISTRIBUTION_BOARD_
  // DEVICE) — w przeciwieństwie do renderJobPdf/renderTemplateZpl nie
  // korzysta z fieldsLayout szablonu, bo to fizyczny układ jak na
  // prawdziwej szynie DIN, nie lista dowolnych pól.
  // -------------------------------------------------------------------

  async renderDinStripPdf(params: {
    jobId: string;
    moduleWidthMm: number;
    rowHeightMm: number;
    cells: DinStripCell[];
    rcdGroups: { label: string; circuitPositions: number[] }[];
  }): Promise<{ pdfPath: string }> {
    const ROW_MODULES = 12; // typowa szerokość jednego rzędu szyny DIN
    const margin = 10;
    const moduleWidthPt = this.mmToPt(params.moduleWidthMm);
    const rowHeightPt = this.mmToPt(params.rowHeightMm);

    // Pakowanie komórek w rzędy po ROW_MODULES modułów (jak fizyczna szyna)
    const rows: DinStripCell[][] = [];
    let currentRow: DinStripCell[] = [];
    let currentWidth = 0;
    for (const cell of params.cells) {
      if (currentWidth + cell.moduleSpan > ROW_MODULES && currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
        currentWidth = 0;
      }
      currentRow.push(cell);
      currentWidth += cell.moduleSpan;
    }
    if (currentRow.length > 0) rows.push(currentRow);

    const stripWidthPt = ROW_MODULES * moduleWidthPt;
    const rcdRowHeightPt = this.mmToPt(22);
    const rcdTableHeightPt = params.rcdGroups.length > 0 ? margin + params.rcdGroups.length * rcdRowHeightPt : 0;
    const pageHeightPt = margin * 2 + rows.length * rowHeightPt + rcdTableHeightPt;
    const pageWidthPt = stripWidthPt + margin * 2;

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(fs.readFileSync(DEJAVU_SANS_PATH));
    const fontBold = await pdfDoc.embedFont(fs.readFileSync(DEJAVU_SANS_BOLD_PATH));
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

    let rowTopY = pageHeightPt - margin;
    for (const row of rows) {
      let x = margin;
      for (const cell of row) {
        const cellWidth = cell.moduleSpan * moduleWidthPt;
        this.drawDinCell(page, x, rowTopY, cellWidth, rowHeightPt, cell, font, fontBold);
        x += cellWidth;
      }
      rowTopY -= rowHeightPt;
    }

    if (params.rcdGroups.length > 0) {
      let y = rowTopY - margin;
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidthPt - margin, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
      y -= 4;
      for (const group of params.rcdGroups) {
        y -= 14;
        page.drawText(fitTextToWidth(group.label, fontBold, 12, stripWidthPt).text, { x: margin, y, size: 12, font: fontBold, color: rgb(0.05, 0.05, 0.05) });
        y -= 14;
        const circuitsText = group.circuitPositions.length > 0
          ? `Obwody: ${group.circuitPositions.sort((a, b) => a - b).join(', ')}`
          : 'Brak przypisanych obwodów';
        page.drawText(circuitsText, { x: margin, y, size: 10, font, color: rgb(0.15, 0.15, 0.6) });
        y -= 12;
        page.drawText('⚠ Test: wciśnij przycisk TEST na wyłączniku przynajmniej raz na pół roku', { x: margin, y, size: 7.5, font, color: rgb(0.6, 0.1, 0.1) });
      }
    }

    const pdfBytes = await pdfDoc.save();
    const key = `labels/print-jobs/${params.jobId}.pdf`;
    await this.storage.saveDocumentAtKey(Buffer.from(pdfBytes), key);
    return { pdfPath: key };
  }

  private drawDinCell(page: any, x: number, topY: number, width: number, height: number, cell: DinStripCell, font: any, fontBold: any) {
    const bottomY = topY - height;
    page.drawRectangle({ x, y: bottomY, width, height, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.75 });

    const pad = 3;
    const numberSize = 11;
    page.drawText(cell.numberLabel, { x: x + pad, y: topY - pad - numberSize, size: numberSize, font: fontBold, color: rgb(0.05, 0.05, 0.05) });

    const iconSize = Math.min(14, width * 0.35);
    drawIcon(page, cell.iconKey, x + width - pad - iconSize / 2, topY - pad - iconSize / 2, iconSize);

    // Opis: w tej wąskiej komórce zawijanie pdf-lib jest tu POŻĄDANE
    // (jeden blok tekstu na komórkę, brak ryzyka nachodzenia na
    // sąsiednie pola — inaczej niż w drawLabelPage dla zwykłych etykiet).
    // WAŻNE: zakotwiczone od GÓRY obszaru opisu (zaraz pod numerem/ikoną),
    // nie od dołu komórki — pdf-lib przy zawijaniu dorysowuje kolejne
    // linie W DÓŁ od podanego y, więc zakotwiczenie od dołu wypychałoby
    // dłuższy, zawinięty opis poza komórkę, na rząd poniżej.
    const descFontSize = Math.max(5.5, Math.min(7.5, width / 6));
    const descTopY = topY - pad - numberSize - 5;
    page.drawText((cell.description || '').slice(0, 45), {
      x: x + pad,
      y: descTopY,
      size: descFontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: width - pad * 2,
      lineHeight: descFontSize + 1.5,
    });
  }
}

// ---- Ikony (proste piktogramy wektorowe, dobierane automatycznie
// z tekstu przeznaczenia obwodu) ----

type IconKey = 'SOCKET' | 'LIGHT' | 'WASHER' | 'WATER' | 'OVEN' | 'TV' | 'HEATING' | 'OTHER';

export interface DinStripCell {
  numberLabel: string; // np. "12" albo "12-13" dla wielomodułowego
  moduleSpan: number; // ile modułów DIN zajmuje (z liczby biegunów)
  description: string;
  iconKey: IconKey;
}

// Dobiera ikonę na podstawie tekstu przeznaczenia obwodu (opis wpisany
// przez instalatora) — proste dopasowanie słów kluczowych po polsku.
export function matchIconKey(purposeText: string | null | undefined): IconKey {
  const t = (purposeText ?? '').toLowerCase();
  if (/zmywar|pralk|suszark/.test(t)) return 'WASHER';
  if (/bojler|podgrzewacz|ciep(ł|l)a woda|cwu/.test(t)) return 'WATER';
  if (/piekarni|kuchen|p(ł|l)yt.*(indukc|grzej|ceramicz)/.test(t)) return 'OVEN';
  if (/o(ś|s)wietl|lamp|(ż|z)ar(ó|o)wk|(ś|s)wiat(ł|l)o/.test(t)) return 'LIGHT';
  if (/\btv\b|telewizor|router|internet|komputer/.test(t)) return 'TV';
  if (/grzejnik|ogrzewani|klimatyz|piec\b/.test(t)) return 'HEATING';
  if (/gniazd/.test(t)) return 'SOCKET';
  return 'OTHER';
}

// Prawdziwe ikony Lucide (te same co w całej reszcie aplikacji —
// frontend używa lucide-react) — ścieżki SVG przerysowane bezpośrednio
// przez pdf-lib (drawSvgPath), więc wyglądają identycznie jak w UI,
// zamiast prostych kształtów geometrycznych.
const ICON_VIEWBOX = 24;
const LUCIDE_PATHS: Record<IconKey, string[]> = {
  SOCKET: [ // plug
    'M12 22v-5', 'M15 8V2',
    'M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z',
    'M9 8V2',
  ],
  LIGHT: [ // lightbulb
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    'M9 18h6', 'M10 22h4',
  ],
  WASHER: ['M3 6h3', 'M17 6h.01', 'M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5'], // washing-machine (+ rect/circle rysowane osobno)
  WATER: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'], // droplet
  OVEN: [ // cooking-pot
    'M2 12h20', 'M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8', 'm4 8 16-4',
    'm8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8',
  ],
  TV: ['m17 2-5 5-5-5'], // + rect rysowany osobno
  HEATING: ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'], // flame
  OTHER: ['M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z'], // zap
};

function drawIcon(page: any, key: IconKey, cx: number, cy: number, size: number) {
  const gray = rgb(0.25, 0.25, 0.25);
  const scale = size / ICON_VIEWBOX;
  const ox = cx - size / 2; // lewy górny róg 24x24 viewBoxa w przestrzeni PDF
  const oy = cy + size / 2;
  const borderWidth = Math.max(0.5, size * 0.09);

  for (const d of LUCIDE_PATHS[key]) {
    page.drawSvgPath(d, { x: ox, y: oy, scale, borderColor: gray, borderWidth, borderLineCap: LineCapStyle.Round });
  }

  // Dodatkowe kształty (rect/circle) dla ikon, które w oryginale Lucide
  // łączą <path> z prostymi prymitywami — przeliczone do tej samej
  // skali/origin co ścieżki powyżej
  const toPdf = (svgX: number, svgY: number): [number, number] => [ox + svgX * scale, oy - svgY * scale];
  if (key === 'WASHER') {
    const [rx, ry] = toPdf(3, 2);
    page.drawRectangle({ x: rx, y: ry - 20 * scale, width: 18 * scale, height: 20 * scale, borderColor: gray, borderWidth });
    const [cx2, cy2] = toPdf(12, 13);
    page.drawCircle({ x: cx2, y: cy2, size: 5 * scale, borderColor: gray, borderWidth });
  }
  if (key === 'TV') {
    const [rx, ry] = toPdf(2, 7);
    page.drawRectangle({ x: rx, y: ry - 15 * scale, width: 20 * scale, height: 15 * scale, borderColor: gray, borderWidth });
  }
}
