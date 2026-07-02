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
}
