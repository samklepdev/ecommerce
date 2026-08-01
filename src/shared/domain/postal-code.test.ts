import { describe, expect, it } from 'vitest';

import { normalizePostalCode, validatePostalCode } from './postal-code';

describe('validatePostalCode', () => {
  it('accepts a 5-digit US ZIP', () => {
    expect(validatePostalCode('77002', 'US')).toBeNull();
  });

  it('accepts ZIP+4', () => {
    expect(validatePostalCode('77002-1234', 'US')).toBeNull();
  });

  it('rejects a US ZIP of the wrong length', () => {
    expect(validatePostalCode('7700', 'US')).toMatch(/ZIP/i);
    expect(validatePostalCode('770021', 'US')).toMatch(/ZIP/i);
  });

  it('rejects letters in a US ZIP', () => {
    expect(validatePostalCode('7700A', 'US')).toMatch(/ZIP/i);
  });

  it('accepts a Canadian postal code in either spacing', () => {
    expect(validatePostalCode('K1A 0B1', 'CA')).toBeNull();
    expect(validatePostalCode('K1A0B1', 'CA')).toBeNull();
  });

  it('rejects a malformed Canadian postal code', () => {
    expect(validatePostalCode('K1A 0B', 'CA')).toMatch(/postal code/i);
  });

  it('accepts a UK postcode', () => {
    expect(validatePostalCode('SW1A 1AA', 'GB')).toBeNull();
  });

  // Every other UK postcode is "letters, digit, optional digit/letter"; this
  // one is a special case issued to the National Girobank and still in use.
  // Nothing about the general pattern can be relaxed to admit it, so it is
  // listed.
  it.each(['GIR 0AA', 'GIR0AA', 'gir 0aa'])('accepts the GIR 0AA special case (%s)', (code) => {
    expect(validatePostalCode(code, 'GB')).toBeNull();
  });

  it('still rejects a malformed UK postcode', () => {
    expect(validatePostalCode('SW1A 1A', 'GB')).toMatch(/postcode/i);
    expect(validatePostalCode('GIR 1AA', 'GB')).toMatch(/postcode/i);
    expect(validatePostalCode('GIRO 0AA', 'GB')).toMatch(/postcode/i);
  });

  it('accepts short-form UK postcodes', () => {
    expect(validatePostalCode('M1 1AE', 'GB')).toBeNull();
    expect(validatePostalCode('B33 8TH', 'GB')).toBeNull();
    expect(validatePostalCode('CR2 6XH', 'GB')).toBeNull();
    expect(validatePostalCode('EC1A 1BB', 'GB')).toBeNull();
  });

  /**
   * Canada Post never uses D, F, I, O, Q or U in a postal code — they are too
   * easily misread as 0, E, 1, 0, O and V by the sorting equipment. A code
   * containing one is not a real address, so accepting it means a parcel that
   * can't be delivered against a payment that can't be reversed.
   */
  it.each(['D1A 0B1', 'K1F 0B1', 'K1A 0I1', 'O1A 0B1', 'Q1A 0B1', 'K1A 0U1'])(
    'rejects the Canada Post forbidden letters (%s)',
    (code) => {
      expect(validatePostalCode(code, 'CA')).toMatch(/postal code/i);
    },
  );

  it('still accepts real Canadian postal codes', () => {
    // One per first-letter region actually in use, so tightening the letter
    // set can't quietly exclude a province.
    for (const code of ['A1A 1A1', 'B3H 4R2', 'C1A 7N8', 'E1C 1E5', 'G1R 5P3', 'H2Y 1C6']) {
      expect(validatePostalCode(code, 'CA')).toBeNull();
    }
    for (const code of ['J8X 3X4', 'K1A 0B1', 'L4W 5N6', 'M5V 3L9', 'N2L 3G1', 'P7B 5E1']) {
      expect(validatePostalCode(code, 'CA')).toBeNull();
    }
    for (const code of ['R3C 4T3', 'S7K 3R6', 'T2P 2M5', 'V6B 4Y8', 'X1A 2P4', 'Y1A 5C6']) {
      expect(validatePostalCode(code, 'CA')).toBeNull();
    }
  });

  // Only the countries with a rule worth encoding get a specific check; the
  // rest fall back to "present and plausibly short", because inventing a
  // format for a country we haven't checked would reject real addresses.
  it('accepts anything non-empty for a country without a specific rule', () => {
    expect(validatePostalCode('1234 AB', 'NL')).toBeNull();
    expect(validatePostalCode('anything', 'JP')).toBeNull();
  });

  it('still rejects an empty or overlong code anywhere', () => {
    expect(validatePostalCode('', 'NL')).toMatch(/postal code/i);
    expect(validatePostalCode('   ', 'NL')).toMatch(/postal code/i);
    expect(validatePostalCode('x'.repeat(20), 'NL')).toMatch(/postal code/i);
  });

  it('is case-insensitive about the country', () => {
    expect(validatePostalCode('77002', 'us')).toBeNull();
  });
});

describe('normalizePostalCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizePostalCode('  k1a 0b1 ')).toBe('K1A 0B1');
  });

  it('collapses runs of internal whitespace', () => {
    expect(normalizePostalCode('SW1A    1AA')).toBe('SW1A 1AA');
  });
});
