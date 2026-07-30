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
  const matrixFor = (value: string) => parseQrMatrix(svgFor(value))!;

  it('packs two module rows per line, with a four-module quiet zone', () => {
    const matrix = matrixFor('otpauth://totp/a?secret=AAAA');

    const lines = renderQrToAnsi(matrix).split('\n');
    const span = matrix.size + 8;

    expect(lines).toHaveLength(Math.ceil(span / 2));
    // Two quiet rows collapse into the first line, so it must be blank.
    expect(lines[0]).not.toMatch(/[▀▄█]/);
    expect(lines[lines.length - 1]).not.toMatch(/[▀▄█]/);
  });

  // Width is the reason this exists: at two cells per module a real
  // otpauth:// symbol is ~98 columns and wraps in an 80-column terminal,
  // which shreds the code.
  it('stays within 80 columns for a realistic otpauth URI', () => {
    const matrix = matrixFor(
      'otpauth://totp/Storefront:kill%20switch?secret=AMZS7J4K3GGNHP3N6QDAGGUBAAA3H2SV&issuer=Storefront&algorithm=SHA1&digits=6&period=30',
    );

    const visibleWidth = renderQrToAnsi(matrix)
      .split('\n')
      .map((line) => line.replace(/\x1b\[[0-9;]*m/g, '').length);

    expect(Math.max(...visibleWidth)).toBe(matrix.size + 8);
    expect(Math.max(...visibleWidth)).toBeLessThanOrEqual(80);
  });

  it('prints black on white explicitly, so it scans on a dark terminal too', () => {
    const output = renderQrToAnsi(matrixFor('x'));

    expect(output).toContain('\x1b[30;47m');
    // Every line closes its own colour rather than leaking it onward.
    for (const line of output.split('\n')) expect(line.endsWith('\x1b[0m')).toBe(true);
  });

  it('draws each module pair as the right half-block', () => {
    // A hand-built matrix beats a generated one here: it pins the mapping
    // rather than asserting whatever the renderer happens to do.
    const modules = [
      [true, false],
      [false, true],
    ];
    const lines = renderQrToAnsi({ size: 2, modules }).split('\n');
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));

    // Rows 4 and 5 of the padded grid are the symbol; they share one line.
    const symbolLine = stripped[2]!;
    expect(symbolLine.slice(4, 6)).toBe('▀▄');
  });
});
