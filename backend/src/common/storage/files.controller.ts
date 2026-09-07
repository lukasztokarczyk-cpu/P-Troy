import { Controller, Get, Query, Res, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { FileStorageService } from './file-storage.service';

// Rozszerzenie pliku → Content-Type. FilesController wcześniej w ogóle
// nie ustawiał tego nagłówka — dla obrazków w <img> przeglądarki jakoś
// zgadywały typ z bajtów, ale np. PDF w <iframe>/wydruku wymaga
// jawnego "application/pdf", inaczej wyświetla surowe bajty jako tekst.
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
};

function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Serwuje pliki z MinIO (patrz FileStorageService), strumieniując je
 * do klienta — MinIO celowo nie jest wystawione publicznie (dostępne
 * tylko w wewnętrznej sieci Dockera), więc ten kontroler jest jedynym
 * sposobem dostępu do plików z zewnątrz.
 * CELOWO bez @UseGuards(JwtAuthGuard) — linki są używane bezpośrednio
 * w atrybutach <img src>/<a href> oraz przez PdfGeneratorService (fetch
 * po stronie serwera, bez nagłówka Authorization), więc bezpieczeństwo
 * zapewnia wyłącznie podpisany token (HMAC + czas wygaśnięcia) w samym
 * URL-u — analogicznie do "presigned URL" w MinIO/S3.
 */
@Controller('api/files')
export class FilesController {
  constructor(private readonly storage: FileStorageService) {}

  @Get()
  async serve(@Query('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!this.storage.verifySignedAccess(key, exp, sig)) {
      throw new ForbiddenException('Nieprawidłowy lub wygasły odnośnik do pliku');
    }
    const exists = await this.storage.exists(key);
    if (!exists) {
      throw new NotFoundException('Plik nie został znaleziony');
    }
    // helmet() ustawia domyślnie Cross-Origin-Resource-Policy: same-origin,
    // co blokuje wczytanie w <img src> z innej domeny (frontend i backend
    // są teraz na osobnych subdomenach: app.p-troy.pl / api.p-troy.pl).
    // Bezpieczne do poluzowania tutaj — dostęp i tak wymaga ważnego
    // podpisu HMAC z czasem wygaśnięcia (patrz verifySignedAccess powyżej).
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', contentTypeFor(key));
    const stream = await this.storage.getObjectStream(key);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  }
}
