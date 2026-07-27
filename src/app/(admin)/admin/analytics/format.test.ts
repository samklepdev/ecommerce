import { describe, expect, it } from 'vitest';

import { compactMoney, formatCount, shortDay, truncateAddress } from './format';

describe('compactMoney', () => {
  it('abbreviates thousands for a chart axis', () => {
    expect(compactMoney(420000, 'USD')).toBe('$4k');
  });

  it('shows whole units below the thousand threshold', () => {
    expect(compactMoney(52500, 'USD')).toBe('$525');
  });

  it('shows zero as a unit amount, not 0k', () => {
    expect(compactMoney(0, 'USD')).toBe('$0');
  });

  it('uses the order currency rather than assuming dollars', () => {
    expect(compactMoney(420000, 'EUR')).toBe('€4k');
  });
});

describe('truncateAddress', () => {
  it('keeps the head and tail of a bech32 address', () => {
    expect(truncateAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toBe('bc1qxy2k…hx0wlh');
  });

  it('leaves an address short enough to show in full alone', () => {
    expect(truncateAddress('bc1qshort')).toBe('bc1qshort');
  });
});

describe('shortDay', () => {
  it('formats a day key for an axis label', () => {
    expect(shortDay('2026-07-25')).toBe('Jul 25');
  });

  it('reads the key as UTC, not the server timezone', () => {
    // A day key is a calendar date from a UTC-grouped query. Parsing it in
    // a negative-offset local zone would shift the label back a day.
    expect(shortDay('2026-01-01')).toBe('Jan 1');
  });
});

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(4128)).toBe('4,128');
  });
});
