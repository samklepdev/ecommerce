/**
 * Turns `qrcode.react`'s rendered SVG back into a module matrix, so a QR
 * code can be drawn in a terminal.
 *
 * Why this exists: the setup script used to write an SVG file for you to
 * open. `renderToStaticMarkup` emits `<svg>` with no `xmlns`, which is fine
 * inline in a page and invalid as a standalone file — nothing would render
 * it. Printing the code instead of writing a file fixes that, and stops a
 * TOTP secret being left on disk in the first place.
 *
 * The library exposes only components, not the matrix, so this reads the
 * foreground `<path>` it draws. That's a coupling to someone else's output
 * format, so `parseQrMatrix` refuses anything it doesn't fully understand
 * rather than returning a half-parsed grid: a QR that is wrong in a way you
 * can't see is worse than no QR.
 */

/**
 * `M12 7h4v1H12z` — a run of `w` dark modules starting at (x, y).
 *
 * Both separators and an optional space before `h` are deliberate: the
 * generator writes most runs as `M35 6h2v1H35z` but the last one on a row as
 * `M44,6 h1v1H44z`. Matching only the first form silently drops the
 * right-hand edge of every row, which yields a QR that looks right and
 * scans wrong — see the finder-pattern test.
 */
const RUN = /M(\d+)[ ,](\d+)\s*h(\d+)v1H\1/g;

export interface QrMatrix {
  size: number;
  /** Row-major; true is a dark module. */
  modules: boolean[][];
}

/** Null when the SVG isn't the shape this understands. */
export function parseQrMatrix(svg: string): QrMatrix | null {
  const viewBox = /viewBox="0 0 (\d+) \1"/.exec(svg);
  if (!viewBox) return null;
  const size = Number(viewBox[1]);
  // A QR symbol is 21, 25, 29 … modules square. Anything else means the
  // markup changed shape and the runs below can't be trusted either.
  if (size < 21 || (size - 21) % 4 !== 0) return null;

  // Two paths: the light background first, then the dark modules. Only the
  // second carries data.
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);
  if (paths.length < 2) return null;
  const foreground = paths[paths.length - 1]!;

  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  let matched = 0;
  for (const run of foreground.matchAll(RUN)) {
    const x = Number(run[1]);
    const y = Number(run[2]);
    const width = Number(run[3]);
    if (y >= size || x + width > size) return null;
    for (let i = 0; i < width; i += 1) modules[y]![x + i] = true;
    matched += 1;
  }
  if (matched === 0) return null;

  return { size, modules };
}

/**
 * The three 7×7 finder patterns — top-left, top-right, bottom-left — are
 * fixed by the spec, so their presence proves the matrix was read in the
 * right orientation and offset. Cheap insurance against the path format
 * changing under us and producing a scannable-looking but wrong grid.
 */
export function hasFinderPatterns({ size, modules }: QrMatrix): boolean {
  const corners: [number, number][] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];

  return corners.every(([top, left]) =>
    [0, 1, 2, 3, 4, 5, 6].every((dy) =>
      [0, 1, 2, 3, 4, 5, 6].every((dx) => {
        const onBorder = dy === 0 || dy === 6 || dx === 0 || dx === 6;
        const inCore = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
        const expected = onBorder || inCore;
        return modules[top + dy]![left + dx] === expected;
      }),
    ),
  );
}

/** Half-block glyphs, indexed by [top is dark][bottom is dark]. Printed
 * black-on-white, so the fill is the dark module and the background is the
 * light one. */
const HALF_BLOCK = [
  [' ', '▄'],
  ['▀', '█'],
] as const;

/**
 * Renders the matrix two rows per line, using half-block characters.
 *
 * **Size is a correctness problem, not a comfort one.** One cell per module
 * makes a 41-module symbol 49 columns wide with its quiet zone; two cells
 * per module makes it 98, which wraps in an 80-column terminal and turns the
 * code into confetti. Packing two module-rows into each line also fixes the
 * aspect ratio — a terminal cell is about twice as tall as it is wide, so
 * half a cell high by one cell wide is square, which is what a scanner
 * expects.
 *
 * Explicit black-on-white, rather than relying on the terminal's own
 * colours: on a dark background the code would come out inverted and no
 * reader will touch it.
 *
 * The four-module quiet zone is part of the spec, not padding — without it
 * scanners can't find the symbol at all.
 */
export function renderQrToAnsi({ size, modules }: QrMatrix): string {
  const QUIET = 4;
  const span = size + QUIET * 2;
  // Black on white, set once per line and reset at the end of it, so a
  // terminal that soft-wraps can't smear the colour across the screen.
  const OPEN = '\x1b[30;47m';
  const CLOSE = '\x1b[0m';

  /** Padded row lookup: anything outside the symbol is quiet zone. */
  const isDark = (row: number, col: number): boolean => {
    const y = row - QUIET;
    const x = col - QUIET;
    if (y < 0 || x < 0 || y >= size || x >= size) return false;
    return modules[y]![x]!;
  };

  const lines: string[] = [];
  for (let row = 0; row < span; row += 2) {
    let line = '';
    for (let col = 0; col < span; col += 1) {
      // The bottom half of the final line falls outside an odd-height grid,
      // which reads as quiet zone — exactly what it should be.
      const top = isDark(row, col);
      const bottom = row + 1 < span ? isDark(row + 1, col) : false;
      line += HALF_BLOCK[top ? 1 : 0][bottom ? 1 : 0];
    }
    lines.push(OPEN + line + CLOSE);
  }

  return lines.join('\n');
}
