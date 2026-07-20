import { describe, expect, it } from 'vitest';
import { parseDecimalToMinorUnits } from './parse-decimal-amount';

describe('parseDecimalToMinorUnits', () => {
  it('parses a plain decimal string without float rounding error', () => {
    expect(parseDecimalToMinorUnits('19.99')).toBe(1999);
  });

  it('strips currency symbols and thousands separators', () => {
    expect(parseDecimalToMinorUnits('$1,999.00')).toBe(199900);
  });

  it('parses an integer with no decimal point as whole-unit minor value', () => {
    expect(parseDecimalToMinorUnits('19')).toBe(1900);
  });

  it('handles a leading negative sign', () => {
    expect(parseDecimalToMinorUnits('-19.99')).toBe(-1999);
  });

  it('truncates (does not round) more than 2 fractional digits', () => {
    expect(parseDecimalToMinorUnits('19.999')).toBe(1999);
  });

  it('pads a single fractional digit', () => {
    expect(parseDecimalToMinorUnits('19.5')).toBe(1950);
  });

  it('handles a trailing decimal point with no fractional digits', () => {
    expect(parseDecimalToMinorUnits('19.')).toBe(1900);
  });

  it('returns null for empty input', () => {
    expect(parseDecimalToMinorUnits('')).toBeNull();
  });

  it('returns null for input with no digits at all', () => {
    expect(parseDecimalToMinorUnits('abc')).toBeNull();
  });

  it('silently strips a misplaced minus sign rather than rejecting it (documented quirk, not a fix)', () => {
    // The regex strips ALL '-' characters, not just a leading one — "1-9"
    // collapses to "19" instead of being treated as malformed input.
    expect(parseDecimalToMinorUnits('1-9')).toBe(1900);
  });
});
