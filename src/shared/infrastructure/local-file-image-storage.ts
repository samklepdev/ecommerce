import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '@/shared/infrastructure/logger';
import type { ImageStorage } from '@/shared/application/ports/image-storage';
import { safeFetch } from './safe-fetch';
import { detectImageType, type DetectedImageType } from './image-type';

const MAX_BYTES = 8 * 1024 * 1024;
const USER_AGENT = 'MystoreImageFetcher/1.0 (+https://example.com/bot)';

const EXTENSION_BY_IMAGE_TYPE: Record<DetectedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

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
      // Guarded like the feed and page fetchers. This URL is the least
      // trusted of the lot — it isn't typed by an admin, it's a field out of
      // a remote supplier feed, so the target is chosen by whoever wrote
      // that feed.
      const res = await safeFetch(sourceUrl, {
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
      if (!stored) {
        logger.warn('image storage: fetched bytes are not a supported image', {
          sourceUrl,
          declaredType: contentType,
        });
      }
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
      if (!stored) {
        logger.warn('image storage: uploaded bytes are not a supported image', {
          declaredType: contentType,
        });
      }
      return stored;
    } catch (e) {
      logger.warn('image storage: unexpected error persisting uploaded file', {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Writes the buffer under an extension decided by its *bytes*.
   *
   * `declaredType` is only used to report a mismatch. It comes from a
   * browser's `File.type` or a remote `Content-Type` header — a claim by
   * whoever supplied the bytes — and letting it choose the extension meant
   * arbitrary content could be written as `.png` and served from a public
   * directory.
   */
  private async persist(buffer: Buffer, declaredType: string): Promise<string | null> {
    const detected = detectImageType(buffer);
    if (!detected) return null;

    const declared = declaredType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (declared !== '' && declared !== detected) {
      logger.warn('image storage: declared type did not match the file contents', {
        declared,
        detected,
      });
    }

    const ext = EXTENSION_BY_IMAGE_TYPE[detected];
    const filename = `${randomUUID()}.${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, filename), buffer);

    return `/uploads/${this.subdir}/${filename}`;
  }
}
