import { afterAll, describe, expect, it } from 'vitest';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { LocalFileImageStorage } from './local-file-image-storage';

const SUBDIR = `test-${process.pid}`;
const DIR = path.join(process.cwd(), 'public', 'uploads', SUBDIR);
const storage = new LocalFileImageStorage(SUBDIR);

function pngBytes(): Buffer {
  const buf = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  return buf;
}

async function storedFiles(): Promise<string[]> {
  try {
    return await readdir(DIR);
  } catch {
    return [];
  }
}

afterAll(async () => {
  await rm(DIR, { recursive: true, force: true });
});

describe('LocalFileImageStorage.storeUploadedFile', () => {
  it('stores a real PNG under a .png name', async () => {
    const url = await storage.storeUploadedFile(pngBytes(), 'image/png');
    expect(url).toMatch(new RegExp(`^/uploads/${SUBDIR}/[0-9a-f-]+\\.png$`));
  });

  // The property that matters: the declared type is a claim, and a claim
  // must not be able to get arbitrary bytes written into a public directory.
  it('refuses HTML that claims to be a PNG, and writes nothing', async () => {
    const before = (await storedFiles()).length;

    const url = await storage.storeUploadedFile(
      Buffer.from('<!doctype html><script>alert(1)</script>'),
      'image/png',
    );

    expect(url).toBeNull();
    expect(await storedFiles()).toHaveLength(before);
  });

  it('stores a real PNG even when the upload mislabels it as a JPEG', async () => {
    // Trusting the label here would have written a .jpg containing a PNG.
    const url = await storage.storeUploadedFile(pngBytes(), 'image/jpeg');
    expect(url).toMatch(/\.png$/);
  });

  it('refuses an empty file', async () => {
    expect(await storage.storeUploadedFile(Buffer.alloc(0), 'image/png')).toBeNull();
  });
});
