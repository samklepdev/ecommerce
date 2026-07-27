import { describe, expect, it } from 'vitest';

import { compactMoney, formatCount, formatDuration, shortDay, truncateAddress } from './format';

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

describe('formatDuration', () => {
  it('shows seconds under a minute', () => {
    expect(formatDuration(8_400)).toBe('8s');
  });

  it('shows minutes and seconds in between', () => {
    expect(formatDuration(72_000)).toBe('1m 12s');
  });

  it('drops a zero seconds remainder', () => {
    expect(formatDuration(120_000)).toBe('2m');
  });

  it('drops seconds entirely past ten minutes', () => {
    // The timer stops when the tab hides, not when the reader looks away,
    // so second-level precision at this scale would be overclaiming.
    expect(formatDuration(11 * 60_000 + 37_000)).toBe('11m');
  });

  it('handles a sub-second reading', () => {
    expect(formatDuration(300)).toBe('0s');
  });
});
