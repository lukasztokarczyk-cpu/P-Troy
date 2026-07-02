import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

/**
 * Warstwa dostępu do plików — zgodnie ze specyfikacją, aplikacja
 * NIGDY nie przechowuje binarnych danych w bazie, tylko ścieżkę.
 * Backend to MinIO (S3-compatible), więc ta sama implementacja
 * działa niezmieniona z docelowym Amazon S3 po podmianie endpointu.
 */
@Injectable()
export class FileStorageService {
  private client: Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.MINIO_BUCKET || 'erp-elektryk';
    this.client = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) await this.client.makeBucket(this.bucket);
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

    await this.client.putObject(this.bucket, fullResKey, buffer);

    const thumbnailBuffer = await sharp(buffer)
      .resize(400, 400, { fit: 'inside' })
      .webp({ quality: 70 })
      .toBuffer();
    await this.client.putObject(this.bucket, thumbnailKey, thumbnailBuffer);

    return { fullResPath: fullResKey, thumbnailPath: thumbnailKey };
  }

  async saveDocument(buffer: Buffer, originalName: string, folder: string) {
    const key = `${folder}/${randomUUID()}-${originalName}`;
    await this.client.putObject(this.bucket, key, buffer);
    return key;
  }

  // Podpisy elektroniczne przychodzą z frontu jako base64 PNG z <canvas>
  async saveBase64Image(base64: string, key: string) {
    const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    await this.client.putObject(this.bucket, key, buffer);
    return key;
  }

  async getSignedUrl(key: string, expirySeconds = 3600) {
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async delete(key: string) {
    await this.client.removeObject(this.bucket, key);
  }
}
