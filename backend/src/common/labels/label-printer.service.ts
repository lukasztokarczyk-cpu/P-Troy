import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';
import { FileStorageService } from '../storage/file-storage.service';

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
    await this.storage.saveDocument(Buffer.from(pdfBytes), `${code.id}.pdf`, 'labels');
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
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const p of params.pages) {
      await this.drawLabelPage(pdfDoc, w, h, p.lines, font, fontBold, p.qrContent);
    }

    const pdfBytes = await pdfDoc.save();
    const key = `labels/print-jobs/${params.jobId}.pdf`;
    await this.storage.saveDocument(Buffer.from(pdfBytes), `${params.jobId}.pdf`, 'labels/print-jobs');
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
      const y = h - margin - lineHeight * (i + 1) + (lineHeight - fontSize) / 2;
      page.drawText(line.text.slice(0, 60), {
        x: textStartX,
        y: Math.max(y, margin),
        size: fontSize,
        font: line.bold ? fontBold : font,
        color: rgb(0.05, 0.05, 0.05),
        maxWidth: textWidth,
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

    let zpl = `^XA\n^PW${widthDots}\n^LL${heightDots}\n`;

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
}
