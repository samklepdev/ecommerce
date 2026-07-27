import { describe, expect, it } from 'vitest';

import { formatSats, tryGetSatsRate } from './sats-pricing';

describe('formatSats', () => {
  it('converts a minor-unit price to whole sats', () => {
    // $157.94 at ~1052.63 sats/USD
    expect(formatSats(15794, 1052.63)).toBe('166,252 sats');
  });

  it('groups thousands', () => {
    expect(formatSats(100000, 1052.63)).toBe('1,052,630 sats');
  });

  it('rounds rather than truncating', () => {
    expect(formatSats(100, 1000.6)).toBe('1,001 sats');
  });

  it('handles a free item', () => {
    expect(formatSats(0, 1052.63)).toBe('0 sats');
  });
});

describe('tryGetSatsRate', () => {
  it('returns the rate when the feed answers', async () => {
    const rates = { satsPerFiatUnit: async () => 1052.63 };

    expect(await tryGetSatsRate(rates, 'USD')).toBe(1052.63);
  });

  it('returns null instead of throwing when the feed is down', async () => {
    // The catalog must still render; sats are decoration next to the fiat
    // price, and the binding quote is locked at checkout regardless.
    const rates = {
      satsPerFiatUnit: async () => {
        throw new Error('rate feed HTTP 503');
      },
    };

    expect(await tryGetSatsRate(rates, 'USD')).toBeNull();
  });
});
