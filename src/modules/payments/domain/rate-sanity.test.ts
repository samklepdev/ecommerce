import { describe, expect, it } from 'vitest';

import { assessRate, DEFAULT_RATE_BANDS } from './rate-sanity';

const BANDS = DEFAULT_RATE_BANDS;

describe('assessRate', () => {
  it('accepts an ordinary price with no history', () => {
    expect(assessRate({ price: 60_000, lastKnownGood: null, bands: BANDS })).toEqual({ ok: true });
  });

  describe('the absolute plausibility band', () => {
    // The band that has to work on a cold start, when there is no history to
    // compare against — which is exactly when a misconfigured or wrong-shaped
    // feed is most likely to be discovered.

    it('rejects a decimal-shifted price that would quote absurd amounts', () => {
      // `{"USD": 1}` — a mis-keyed field, a units bug, a spoofed endpoint.
      // At this price a $49.99 order quotes ~50 BTC. Nobody pays it, so
      // checkout is silently dead while reporting success.
      const result = assessRate({ price: 1, lastKnownGood: null, bands: BANDS });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('implausible');
    });

    it('rejects a price so high the order costs a few satoshis', () => {
      // The dangerous direction. At `{"USD": 100000000}` a $49.99 order quotes
      // ~50 sats, the customer pays it, the watcher sees confirmedSats >=
      // expectedSats, and the shop ships goods for a fraction of a cent —
      // irreversibly.
      const result = assessRate({ price: 100_000_000, lastKnownGood: null, bands: BANDS });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('implausible');
    });

    it('accepts prices at the edges of the band', () => {
      expect(assessRate({ price: BANDS.minPrice, lastKnownGood: null, bands: BANDS }).ok).toBe(true);
      expect(assessRate({ price: BANDS.maxPrice, lastKnownGood: null, bands: BANDS }).ok).toBe(true);
    });

    it('is wide enough not to fire on a real market', () => {
      // Deliberately coarse: this is a units check, not a market view. It must
      // never be the thing that stops the shop trading on a volatile day.
      for (const price of [5_000, 20_000, 69_000, 250_000, 1_000_000]) {
        expect(assessRate({ price, lastKnownGood: null, bands: BANDS }).ok).toBe(true);
      }
    });

    it('rejects an implausible price even when history would allow it', () => {
      // A last-known-good that is itself junk must not launder the next one.
      const result = assessRate({ price: 1, lastKnownGood: 1.1, bands: BANDS });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('implausible');
    });
  });

  describe('the deviation band', () => {
    // What catches a feed that starts returning plausible-but-wrong numbers:
    // the price is in range, but nothing moves 40% between two polls 30
    // seconds apart.

    it('accepts a small move', () => {
      expect(assessRate({ price: 61_000, lastKnownGood: 60_000, bands: BANDS }).ok).toBe(true);
    });

    it('accepts a move right at the limit', () => {
      // 25% up from 60,000.
      expect(assessRate({ price: 75_000, lastKnownGood: 60_000, bands: BANDS }).ok).toBe(true);
    });

    it('rejects a sudden doubling', () => {
      const result = assessRate({ price: 120_000, lastKnownGood: 60_000, bands: BANDS });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('deviation');
    });

    it('rejects a sudden halving', () => {
      const result = assessRate({ price: 30_000, lastKnownGood: 60_000, bands: BANDS });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('deviation');
    });

    it('measures deviation symmetrically against the last known good', () => {
      // Both directions are measured as a fraction of the reference, so a
      // rise and a fall of the same proportion are treated the same way.
      const up = assessRate({ price: 60_000 * 1.3, lastKnownGood: 60_000, bands: BANDS });
      const down = assessRate({ price: 60_000 * 0.7, lastKnownGood: 60_000, bands: BANDS });
      expect(up.ok).toBe(false);
      expect(down.ok).toBe(false);
    });

    it('does not apply when there is no last known good', () => {
      // After a restart with a cold store, or on first ever run. The absolute
      // band still applies; refusing to trade at all would be worse than
      // trading on a price we can't cross-check.
      expect(assessRate({ price: 60_000, lastKnownGood: null, bands: BANDS }).ok).toBe(true);
    });

    it('ignores a non-positive reference rather than dividing by it', () => {
      // A corrupted stored value must not make every subsequent rate
      // un-checkable, or a division by zero.
      expect(assessRate({ price: 60_000, lastKnownGood: 0, bands: BANDS }).ok).toBe(true);
      expect(assessRate({ price: 60_000, lastKnownGood: -5, bands: BANDS }).ok).toBe(true);
    });
  });

  describe('configurable bands', () => {
    it('honours a tighter deviation limit', () => {
      // 10% up from 60,000, against a 5% limit. (Exactly at the limit is
      // accepted — see "accepts a move right at the limit" above.)
      const bands = { ...BANDS, maxDeviationRatio: 0.05 };
      expect(assessRate({ price: 66_000, lastKnownGood: 60_000, bands }).ok).toBe(false);
      expect(assessRate({ price: 63_000, lastKnownGood: 60_000, bands }).ok).toBe(true);
    });

    it('honours a widened absolute band', () => {
      const bands = { ...BANDS, minPrice: 0.5 };
      expect(assessRate({ price: 1, lastKnownGood: null, bands }).ok).toBe(true);
    });

    it('treats a zero deviation ratio as "no deviation check"', () => {
      // Otherwise a misconfigured 0 would refuse every rate that isn't
      // bit-identical to the last one, which is every rate.
      const bands = { ...BANDS, maxDeviationRatio: 0 };
      expect(assessRate({ price: 120_000, lastKnownGood: 60_000, bands }).ok).toBe(true);
    });
  });
});
