/**
 * What an uploaded file actually is, read from its leading bytes.
 *
 * The declared type — a browser's `File.type`, or a remote server's
 * `Content-Type` — is a claim by whoever supplied the bytes, and it decides
 * the extension a file gets written under. Sniffing means a `.png` on disk
 * really is a PNG, whatever the upload said.
 *
 * Deliberately a short allow-list of the formats this storage serves, not a
 * general-purpose detector: anything unrecognised is refused, which is the
 * behaviour you want when the alternative is writing unknown bytes into a
 * publicly-served directory.
 */

export type DetectedImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, i) => buffer[i] === byte);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** SOI + the start of any APPn/marker segment. */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (startsWith(buffer, PNG_MAGIC)) return 'image/png';
  if (startsWith(buffer, JPEG_MAGIC)) return 'image/jpeg';

  // GIF87a / GIF89a
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    const version = buffer.subarray(3, 6).toString('ascii');
    if (version === '87a' || version === '89a') return 'image/gif';
  }

  // RIFF is a container: WAV and AVI use it too, so the WEBP form at offset
  // 8 is what makes it an image.
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}
