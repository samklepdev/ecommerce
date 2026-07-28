import { describe, expect, it } from 'vitest';

import { parseBtcPrice } from './rate-response';

describe('parseBtcPrice', () => {
  it('reads the price for the requested currency', () => {
    expect(parseBtcPrice({ USD: 60000, EUR: 55000 }, 'USD')).toBe(60000);
  });

  it('accepts a fractional price', () => {
    expect(parseBtcPrice({ USD: 60000.5 }, 'USD')).toBe(60000.5);
  });

  it('throws when the currency is absent', () => {
    expect(() => parseBtcPrice({ EUR: 55000 }, 'USD')).toThrow(/USD/);
  });

  // The old code did `(json) as Record<string, number>` and then only
  // checked `!price || price <= 0`. A string sails through both — `"abc"` is
  // truthy and `"abc" <= 0` is false — and then SATS_PER_BTC / "abc" is NaN,
  // which becomes the sats a customer is asked to pay.
  it('rejects a price that is not a number', () => {
    expect(() => parseBtcPrice({ USD: 'abc' }, 'USD')).toThrow(/price/i);
    expect(() => parseBtcPrice({ USD: '60000' }, 'USD')).toThrow(/price/i);
    expect(() => parseBtcPrice({ USD: null }, 'USD')).toThrow(/price/i);
  });

  it('rejects zero, negative and non-finite prices', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => parseBtcPrice({ USD: bad }, 'USD')).toThrow(/price/i);
    }
  });

  it('rejects a response that is not an object of prices', () => {
    for (const bad of [null, 'nope', 42, []]) {
      expect(() => parseBtcPrice(bad, 'USD')).toThrow(/rate feed|price/i);
    }
  });
});
