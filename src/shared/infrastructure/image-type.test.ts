import { describe, expect, it } from 'vitest';

import { detectImageType } from './image-type';

/** Real headers, then filler — detection only ever reads the first bytes. */
function withHeader(bytes: number[], size = 64): Buffer {
  const buf = Buffer.alloc(size);
  Buffer.from(bytes).copy(buf);
  return buf;
}

const PNG = withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = withHeader([0xff, 0xd8, 0xff, 0xe0]);
const GIF87 = withHeader([...Buffer.from('GIF87a')]);
const GIF89 = withHeader([...Buffer.from('GIF89a')]);

function webp(): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from('RIFF').copy(buf, 0);
  buf.writeUInt32LE(56, 4);
  Buffer.from('WEBP').copy(buf, 8);
  return buf;
}

describe('detectImageType', () => {
  it('recognises the formats this storage accepts', () => {
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(GIF87)).toBe('image/gif');
    expect(detectImageType(GIF89)).toBe('image/gif');
    expect(detectImageType(webp())).toBe('image/webp');
  });

  // The whole point: what the browser or a remote server *claims* is
  // irrelevant, only the bytes count.
  it('returns null for content that only claims to be an image', () => {
    expect(detectImageType(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectImageType(Buffer.from('MZ\x90\x00'))).toBeNull(); // a Windows executable
  });

  it('returns null for empty or truncated input', () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0x89, 0x50]))).toBeNull();
  });

  // RIFF is also WAV and AVI; only the WEBP form is an image.
  it('does not accept a non-WEBP RIFF container', () => {
    const wav = Buffer.alloc(64);
    Buffer.from('RIFF').copy(wav, 0);
    Buffer.from('WAVE').copy(wav, 8);
    expect(detectImageType(wav)).toBeNull();
  });

  it('ignores trailing junk after a valid header', () => {
    const png = Buffer.concat([PNG, Buffer.from('<script>alert(1)</script>')]);
    expect(detectImageType(png)).toBe('image/png');
  });
});
