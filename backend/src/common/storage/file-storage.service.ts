import { Injectable } from '@nestjs/common';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { Client as MinioClient } from 'minio';
import sharp from 'sharp';

/**
 * Warstwa dostępu do plików — zgodnie ze specyfikacją, aplikacja
 * NIGDY nie przechowuje binarnych danych w bazie, tylko ścieżkę (klucz
 * obiektu w MinIO).
 *
 * Backendem jest MinIO (S3-kompatybilny object storage) uruchomiony
 * jako osobna usługa w Coolify, dostępny wyłącznie w wewnętrznej sieci
 * Dockera (nigdy nie wystawiony publicznie). Interfejs publiczny
 * (savePhotoWithThumbnail, saveDocument, saveBase64Image, getSignedUrl,
 * delete) jest identyczny jak w poprzedniej wersji opartej o dysk
 * lokalny, więc żaden inny moduł (Failures, Signatures, Expenses,
 * Sites/InvestorAgreements, Assets, PdfGenerator, LabelPrinter) nie
 * wymagał zmian przy tej migracji.
 *
 * Pliki nie są serwowane bezpośrednio z MinIO (który nie jest publicznie
 * dostępny), tylko przez kontroler FilesController, który weryfikuje
 * podpisany link (HMAC + czas wygaśnięcia) i strumieniuje obiekt z MinIO
 * do klienta — odpowiednik "presigned URL", tyle że podpis generowany
 * jest przez naszą aplikację, a nie przez sam MinIO, żeby URL-e
 * pozostały pod tą samą domeną co reszta API (bez CORS-owych komplikacji).
 */
@Injectable()
export class FileStorageService {
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly origin: string;
  private readonly signingSecret: string;

  constructor() {
    this.bucket = process.env.MINIO_BUCKET || 'p-troy-storage';
    this.client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    });
    // FRONTEND_URL jest już ustawione w .env (ta sama domena co backend
    // w obecnym wdrożeniu) — API_PUBLIC_URL to opcjonalne nadpisanie,
    // gdyby backend i frontend kiedyś znalazły się na różnych domenach.
    this.origin = (process.env.API_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:4000').replace(/\/$/, '');
    this.signingSecret = process.env.FILE_SIGNING_SECRET || process.env.JWT_ACCESS_SECRET || 'zmien-mnie-w-env';
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
      }
    } catch (err) {
      console.error(
        `[FileStorageService] Nie udało się połączyć z MinIO / zweryfikować bucketa (${this.bucket}): ${(err as Error).message}. ` +
        'Funkcje wgrywania zdjęć/dokumentów/podpisów będą niedostępne, dopóki MinIO nie będzie osiągalne.',
      );
    }
  }

  private resolveKey(key: string): string {
    if (key.includes('..')) throw new Error('Nieprawidłowy klucz pliku');
    return key;
  }

  private async writeBuffer(key: string, buffer: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await this.client.putObject(this.bucket, target, buffer);
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
    await this.client.removeObject(this.bucket, this.resolveKey(key)).catch(() => undefined);
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

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Zwraca strumień odczytu obiektu z MinIO — używane wyłącznie przez
   * FilesController do przekazania (pipe) zawartości pliku do klienta,
   * po pozytywnej weryfikacji podpisanego linku.
   */
  async getObjectStream(key: string) {
    return this.client.getObject(this.bucket, this.resolveKey(key));
  }
}