import { Controller, Get, Query, Res, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { FileStorageService } from './file-storage.service';

/**
 * Serwuje pliki z lokalnego magazynu (patrz FileStorageService).
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
  serve(@Query('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!this.storage.verifySignedAccess(key, exp, sig)) {
      throw new ForbiddenException('Nieprawidłowy lub wygasły odnośnik do pliku');
    }
    if (!this.storage.exists(key)) {
      throw new NotFoundException('Plik nie został znaleziony');
    }
    res.sendFile(this.storage.getLocalPath(key));
  }
}
