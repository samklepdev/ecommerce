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
