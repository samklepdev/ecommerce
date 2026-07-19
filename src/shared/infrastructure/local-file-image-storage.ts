import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '@/shared/infrastructure/logger';
import type { ImageStorage } from '@/shared/application/ports/image-storage';

const MAX_BYTES = 8 * 1024 * 1024;
const USER_AGENT = 'MystoreImageFetcher/1.0 (+https://example.com/bot)';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function extensionFor(contentType: string): string | null {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return EXTENSION_BY_CONTENT_TYPE[type] ?? null;
}

export class LocalFileImageStorage implements ImageStorage {
  private readonly dir: string;

  constructor(private readonly subdir: string = 'products') {
    this.dir = path.join(process.cwd(), 'public', 'uploads', subdir);
  }

  async store(sourceUrl: string): Promise<string | null> {
    try {
      // Referer set to the image's own origin — satisfies the common anti-hotlinking
      // check ("don't embed my images on other sites") without misrepresenting who's
      // asking; the UA stays honest.
      const res = await fetch(sourceUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: `${new URL(sourceUrl).origin}/`,
        },
      });

      if (!res.ok || !res.body) {
        logger.warn('image storage: fetch failed', { sourceUrl, status: res.status });
        return null;
      }

      const contentType = res.headers.get('content-type') ?? '';
      const contentLength = res.headers.get('content-length');
      if (contentLength && Number(contentLength) > MAX_BYTES) {
        logger.warn('image storage: declared content-length too large', { sourceUrl, contentLength });
        return null;
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > MAX_BYTES) {
          logger.warn('image storage: downloaded bytes exceeded max size', { sourceUrl, totalBytes });
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }

      const stored = await this.persist(Buffer.concat(chunks), contentType);
      if (!stored) logger.warn('image storage: unrecognized content type', { sourceUrl, contentType });
      return stored;
    } catch (e) {
      logger.warn('image storage: unexpected error during persistence', {
        sourceUrl,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  async storeUploadedFile(buffer: Buffer, contentType: string): Promise<string | null> {
    try {
      if (buffer.length > MAX_BYTES) {
        logger.warn('image storage: uploaded file too large', { size: buffer.length });
        return null;
      }

      const stored = await this.persist(buffer, contentType);
      if (!stored) logger.warn('image storage: unrecognized uploaded content type', { contentType });
      return stored;
    } catch (e) {
      logger.warn('image storage: unexpected error persisting uploaded file', {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private async persist(buffer: Buffer, contentType: string): Promise<string | null> {
    const ext = extensionFor(contentType);
    if (!ext) return null;

    const filename = `${randomUUID()}.${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, filename), buffer);

    return `/uploads/${this.subdir}/${filename}`;
  }
}
