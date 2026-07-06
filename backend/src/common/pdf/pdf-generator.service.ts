import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FileStorageService } from '../storage/file-storage.service';

interface SignedDocumentInput {
  title: string;
  contentSnapshot: Record<string, unknown>;
  signatures: {
    signerRole: string;
    signerName: string;
    signedAt: Date;
    signatureImagePath: string;
    ipAddress: string;
  }[];
}

interface SiteSummaryPdfInput {
  siteName: string;
  investor: string;
  address: string;
  completedWorks: { title: string; description?: string | null; completedAt?: string | null }[];
  extraWorks: { title: string; description?: string | null; completedAt?: string | null }[];
  materialsUsed: { productName: string; quantity: number; unit: string }[];
  includeMaterials: boolean; // false = wersja dla klienta
}

/**
 * Generuje finalny PDF protokołu pomiarowego / odbioru prac po
 * skompletowaniu wszystkich wymaganych podpisów. Dokument jest
 * budowany z niemutowalnego contentSnapshot zapisanego w momencie
 * utworzenia SignableDocument — gwarantuje to, że PDF odzwierciedla
 * dokładnie to, co zostało podpisane, nawet jeśli dane źródłowe
 * (np. wyniki pomiaru) zmienią się później.
 */
@Injectable()
export class PdfGeneratorService {
  constructor(private readonly storage: FileStorageService) {}

  async generateSignedDocumentPdf(input: SignedDocumentInput): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595, 842]); // A4
    let y = 800;

    const drawLine = (text: string, size = 11, bold = false, color = rgb(0.1, 0.1, 0.1)) => {
      if (y < 80) {
        page = pdfDoc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(text, { x: 50, y, size, font: bold ? boldFont : font, color });
      y -= size + 8;
    };

    drawLine(input.title, 18, true, rgb(0.95, 0.45, 0.13));
    drawLine(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, 9, false, rgb(0.4, 0.4, 0.4));
    y -= 10;

    drawLine('Treść protokołu', 13, true);
    for (const [key, value] of Object.entries(input.contentSnapshot)) {
      drawLine(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    }

    y -= 10;
    drawLine('Podpisy', 13, true);
    for (const sig of input.signatures) {
      drawLine(`${sig.signerRole} — ${sig.signerName}`, 11, true);
      drawLine(`Podpisano: ${sig.signedAt.toLocaleString('pl-PL')} · IP: ${sig.ipAddress}`, 9, false, rgb(0.4, 0.4, 0.4));

      try {
        const imageBytes = await this.storage.getSignedUrl(sig.signatureImagePath).then((url) =>
          fetch(url).then((r) => r.arrayBuffer()),
        );
        const image = await pdfDoc.embedPng(imageBytes);
        const dims = image.scaleToFit(150, 60);
        if (y < dims.height + 20) {
          page = pdfDoc.addPage([595, 842]);
          y = 800;
        }
        page.drawImage(image, { x: 50, y: y - dims.height, width: dims.width, height: dims.height });
        y -= dims.height + 16;
      } catch {
        drawLine('[Nie udało się osadzić obrazu podpisu]', 9, false, rgb(0.7, 0.2, 0.2));
      }
    }

    const pdfBytes = await pdfDoc.save();
    const key = await this.storage.saveDocument(Buffer.from(pdfBytes), 'protokol.pdf', 'signed-documents');
    return key;
  }

  /**
   * Podsumowanie zakończonej budowy. Dwie wersje z tego samego wejścia:
   * wewnętrzna (includeMaterials=true, z sekcją materiałów) oraz dla
   * klienta (includeMaterials=false — tylko zakres wykonanych prac,
   * bez ujawniania zużytych materiałów).
   */
  async generateSiteSummaryPdf(input: SiteSummaryPdfInput): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595, 842]);
    let y = 800;

    const drawLine = (text: string, size = 11, bold = false, color = rgb(0.1, 0.1, 0.1)) => {
      if (y < 80) {
        page = pdfDoc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(text, { x: 50, y, size, font: bold ? boldFont : font, color, maxWidth: 495 });
      y -= size + 8;
    };

    const label = input.includeMaterials ? 'Podsumowanie budowy (wewnętrzne)' : 'Podsumowanie prac dla klienta';
    drawLine(label, 18, true, rgb(0.95, 0.45, 0.13));
    drawLine(input.siteName, 13, true);
    drawLine(`Inwestor: ${input.investor}`, 10, false, rgb(0.4, 0.4, 0.4));
    drawLine(`Adres: ${input.address}`, 10, false, rgb(0.4, 0.4, 0.4));
    drawLine(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, 9, false, rgb(0.5, 0.5, 0.5));
    y -= 8;

    drawLine('Wykonane prace', 13, true);
    if (input.completedWorks.length === 0) {
      drawLine('Brak zarejestrowanych prac.', 10, false, rgb(0.5, 0.5, 0.5));
    }
    for (const work of input.completedWorks) {
      drawLine(`• ${work.title}`, 10, true);
      if (work.description) drawLine(`  ${work.description}`, 9, false, rgb(0.35, 0.35, 0.35));
    }

    if (input.extraWorks.length > 0) {
      y -= 6;
      drawLine('Prace dodatkowe', 13, true);
      for (const work of input.extraWorks) {
        drawLine(`• ${work.title}`, 10, true);
        if (work.description) drawLine(`  ${work.description}`, 9, false, rgb(0.35, 0.35, 0.35));
      }
    }

    if (input.includeMaterials) {
      y -= 6;
      drawLine('Wykorzystane materiały', 13, true);
      if (input.materialsUsed.length === 0) {
        drawLine('Brak zarejestrowanego zużycia materiałów.', 10, false, rgb(0.5, 0.5, 0.5));
      }
      for (const m of input.materialsUsed) {
        drawLine(`• ${m.productName} — ${m.quantity} ${m.unit}`, 10);
      }
    }

    const pdfBytes = await pdfDoc.save();
    const folder = 'site-summaries';
    const fileName = input.includeMaterials ? 'podsumowanie-wewnetrzne.pdf' : 'podsumowanie-klient.pdf';
    const key = await this.storage.saveDocument(Buffer.from(pdfBytes), fileName, folder);
    return key;
  }
}
