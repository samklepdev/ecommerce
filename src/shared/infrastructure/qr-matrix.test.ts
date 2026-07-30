import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { createElement } from 'react';

import { hasFinderPatterns, parseQrMatrix, renderQrToAnsi } from './qr-matrix';

/** Renders through the same library the setup script uses, so these tests
 * fail if its markup ever changes shape — which is the whole risk of
 * reading someone else's SVG. */
function svgFor(value: string): string {
  return renderToStaticMarkup(createElement(QRCodeSVG, { value, size: 256 }));
}

describe('parseQrMatrix', () => {
  it('reads a square matrix of a valid QR size', () => {
    const matrix = parseQrMatrix(svgFor('otpauth://totp/Storefront:kill%20switch?secret=JBSWY3DP'));

    expect(matrix).not.toBeNull();
    expect(matrix!.size).toBeGreaterThanOrEqual(21);
    expect((matrix!.size - 21) % 4).toBe(0);
    expect(matrix!.modules).toHaveLength(matrix!.size);
    expect(matrix!.modules.every((row) => row.length === matrix!.size)).toBe(true);
  });

  // The check that actually proves the parse: finder patterns are fixed by
  // the spec, so if they're where they should be, the grid was read in the
  // right orientation and offset.
  it('produces a grid with all three finder patterns intact', () => {
    for (const value of ['otpauth://totp/a?secret=AAAA', 'https://example.com/' + 'x'.repeat(80)]) {
      const matrix = parseQrMatrix(svgFor(value));

      expect(matrix).not.toBeNull();
      expect(hasFinderPatterns(matrix!)).toBe(true);
    }
  });

  it('has dark modules, and not merely a filled or empty grid', () => {
    const { modules, size } = parseQrMatrix(svgFor('otpauth://totp/a?secret=AAAA'))!;
    const dark = modules.flat().filter(Boolean).length;

    expect(dark).toBeGreaterThan(size * 2);
    expect(dark).toBeLessThan(size * size);
  });

  // Refusing beats guessing: a half-parsed QR scans into the wrong secret.
  it('returns null for markup it does not fully understand', () => {
    expect(parseQrMatrix('<svg></svg>')).toBeNull();
    expect(parseQrMatrix('<svg viewBox="0 0 22 22"><path d="M0,0 h1v1H0z"/><path d="" /></svg>')).toBeNull();
    expect(parseQrMatrix('<svg viewBox="0 0 21 21"><path d="M0,0 h21v21H0z"/></svg>')).toBeNull();
    // A run that would spill outside the grid.
    expect(
      parseQrMatrix('<svg viewBox="0 0 21 21"><path d="M0,0 h21v21H0z"/><path d="M20 0h5v1H20z"/></svg>'),
    ).toBeNull();
  });
});

describe('renderQrToAnsi', () => {
  it('draws every row with a four-module quiet zone on all sides', () => {
    const matrix = parseQrMatrix(svgFor('otpauth://totp/a?secret=AAAA'))!;

    const lines = renderQrToAnsi(matrix).split('\n');

    expect(lines).toHaveLength(matrix.size + 8);
    // The first four rows are entirely light — the quiet zone the spec
    // requires for a scanner to find the symbol at all.
    expect(lines.slice(0, 4).every((line) => !line.includes('\x1b[40m'))).toBe(true);
    expect(lines.slice(-4).every((line) => !line.includes('\x1b[40m'))).toBe(true);
  });

  it('uses background colours, not block characters, so it scans on a dark terminal too', () => {
    const output = renderQrToAnsi(parseQrMatrix(svgFor('x'))!);

    expect(output).toContain('\x1b[40m');
    expect(output).toContain('\x1b[47m');
    expect(output).not.toContain('█');
  });
});
