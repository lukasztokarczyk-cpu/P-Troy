import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import sharp from 'sharp';

/**
 * Warstwa dostępu do plików — zgodnie ze specyfikacją, aplikacja
 * NIGDY nie przechowuje binarnych danych w bazie, tylko ścieżkę.
 *
 * Ten hosting współdzielony (CloudLinux, brak roota/Dockera) nie
 * pozwala uruchomić własnego serwera MinIO jako trwałej usługi w tle
 * — dlatego backendem jest lokalny system plików serwera, na którym
 * działa aplikacja. Interfejs publiczny (savePhotoWithThumbnail,
 * saveDocument, saveBase64Image, getSignedUrl, delete) jest identyczny
 * jak poprzednio, więc żaden inny moduł (Failures, Signatures,
 * Expenses, Sites/InvestorAgreements, Assets) nie wymaga zmian — jeśli
 * w przyszłości pojawi się prawdziwy MinIO/S3 (np. po migracji na
 * własny serwer), wystarczy podmienić tylko ten plik.
 *
 * Pliki nie są serwowane bezpośrednio przez webserwer (poza publicznym
 * katalogiem), tylko przez kontroler FilesController, który weryfikuje
 * podpisany link (HMAC + czas wygaśnięcia) — odpowiednik "presigned URL"
 * z MinIO/S3, tyle że generowany lokalnie.
 */
@Injectable()
export class FileStorageService {
  private readonly basePath: string;
  private readonly origin: string;
  private readonly signingSecret: string;

  constructor() {
    this.basePath = process.env.STORAGE_LOCAL_PATH || path.join(process.cwd(), 'storage');
    // FRONTEND_URL jest już ustawione w .env (ta sama domena co backend
    // w obecnym wdrożeniu) — API_PUBLIC_URL to opcjonalne nadpisanie,
    // gdyby backend i frontend kiedyś znalazły się na różnych domenach.
    this.origin = (process.env.API_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:4000').replace(/\/$/, '');
    this.signingSecret = process.env.FILE_SIGNING_SECRET || process.env.JWT_ACCESS_SECRET || 'zmien-mnie-w-env';
  }

  async onModuleInit() {
    await fsp.mkdir(this.basePath, { recursive: true }).catch((err) => {
      console.error(
        `[FileStorageService] Nie udało się utworzyć katalogu przechowywania plików (${this.basePath}): ${err.message}. ` +
        'Funkcje wgrywania zdjęć/dokumentów/podpisów będą niedostępne, dopóki katalog nie będzie zapisywalny.',
      );
    });
  }

  private resolveLocalPath(key: string): string {
    if (key.includes('..')) throw new Error('Nieprawidłowy klucz pliku');
    return path.join(this.basePath, key);
  }

  private async writeBuffer(key: string, buffer: Buffer): Promise<void> {
    const target = this.resolveLocalPath(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, buffer);
  }

  /**
   * Zapisuje zdjęcie w PEŁNEJ rozdzielczości oraz automatycznie
   * generuje skompresowaną miniaturę (wymóg: "automatyczna kompresja
   * miniaturek"). Zwraca obie ścieżki — aplikacja zapisuje w bazie
   * tylko te ścieżki, nigdy same bajty obrazu.
   */
  async savePhotoWithThumbnail(buffer: Buffer, originalName: string, folder: string) {
    const ext = originalName.split('.').pop() || 'jpg';
    const baseKey = `${folder}/${randomUUID()}`;
    const fullResKey = `${baseKey}.${ext}`;
    const thumbnailKey = `${baseKey}-thumb.webp`;

    await this.writeBuffer(fullResKey, buffer);

    const thumbnailBuffer = await sharp(buffer)
      .resize(400, 400, { fit: 'inside' })
      .webp({ quality: 70 })
      .toBuffer();
    await this.writeBuffer(thumbnailKey, thumbnailBuffer);

    return { fullResPath: fullResKey, thumbnailPath: thumbnailKey };
  }

  async saveDocument(buffer: Buffer, originalName: string, folder: string) {
    const key = `${folder}/${randomUUID()}-${originalName}`;
    await this.writeBuffer(key, buffer);
    return key;
  }

  // Podpisy elektroniczne i inne załączniki przychodzą z frontu jako base64
  async saveBase64Image(base64: string, key: string) {
    const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    await this.writeBuffer(key, buffer);
    return key;
  }

  async getSignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expirySeconds;
    const sig = this.sign(key, exp);
    return `${this.origin}/api/files?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`;
  }

  async delete(key: string) {
    await fsp.unlink(this.resolveLocalPath(key)).catch(() => undefined);
  }

  // ---- Używane przez FilesController do serwowania i weryfikacji ----

  sign(key: string, exp: number): string {
    return createHmac('sha256', this.signingSecret).update(`${key}:${exp}`).digest('hex');
  }

  verifySignedAccess(key: string, exp: string, sig: string): boolean {
    const expNum = Number(exp);
    if (!key || !expNum || !sig) return false;
    if (Math.floor(Date.now() / 1000) > expNum) return false;
    const expected = this.sign(key, expNum);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  getLocalPath(key: string): string {
    return this.resolveLocalPath(key);
  }

  exists(key: string): boolean {
    return fs.existsSync(this.resolveLocalPath(key));
  }
}
