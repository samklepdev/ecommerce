/** Converts an external decimal price string ("19.99", "$1,999.00") to
 * integer minor units without float multiplication (which would round
 * "19.99" * 100 to 1998.9999999998) — pure string manipulation, then a
 * single integer parse. For untrusted/free-text input at an ingestion
 * boundary (CSV cell, scraped text); never use this for arithmetic on an
 * already-trusted `Money` value. */
export function parseDecimalToMinorUnits(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;

  const negative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/-/g, '');
  const [wholePart = '0', fracPart = ''] = unsigned.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const minorUnits = Number((wholePart || '0') + paddedFrac);

  if (!Number.isFinite(minorUnits)) return null;
  return negative ? -minorUnits : minorUnits;
}
