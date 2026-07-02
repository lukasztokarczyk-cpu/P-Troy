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
    const key = `signed-documents/${Date.now()}-protokol.pdf`;
    await this.storage.saveDocument(Buffer.from(pdfBytes), 'protokol.pdf', 'signed-documents');
    return key;
  }
}
