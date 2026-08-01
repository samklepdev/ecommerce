/**
 * Whether a BTC price is worth quoting from.
 *
 * `parseBtcPrice` validates the *shape* of the feed's response — finite,
 * positive, numeric — and nothing about plausibility. A feed that returns a
 * well-formed but wrong number misprices every order placed against it, in
 * one of two directions:
 *
 *   * too low (`{"USD": 1}`): a $49.99 order quotes ~50 BTC. Nobody pays,
 *     checkout is dead, and nothing reports a failure.
 *   * too high (`{"USD": 100000000}`): the same order quotes ~50 sats, the
 *     customer pays it, the watcher sees `confirmedSats >= expectedSats`, and
 *     the shop ships goods for a fraction of a cent. Bitcoin is irreversible
 *     and there is no refund mechanism, so that one cannot be undone.
 *
 * Pure, so the bands can be tested without a feed or a clock — the provider
 * that fetches the number and the store that remembers it are elsewhere.
 */

export interface RateBands {
  /** Coarse absolute floor on the price of one BTC. */
  minPrice: number;
  /** Coarse absolute ceiling. */
  maxPrice: number;
  /** How far the price may move from the last accepted one, as a fraction.
   * 0 disables the check. */
  maxDeviationRatio: number;
}

/**
 * Deliberately coarse. This is a units check, not a market view: its job is to
 * catch a decimal shift, a mis-keyed field or a spoofed endpoint, and it must
 * never be the thing that stops the shop trading on a volatile day. The
 * deviation band is what catches a plausible-but-wrong number.
 */
export const DEFAULT_RATE_BANDS: RateBands = {
  minPrice: 1_000,
  maxPrice: 10_000_000,
  maxDeviationRatio: 0.25,
};

export type RateAssessment =
  | { ok: true }
  | {
      ok: false;
      /** `implausible`: outside the absolute band, so almost certainly a units
       * or configuration fault. `deviation`: in range, but too far from the
       * last price we accepted to have come from the same market. */
      reason: 'implausible' | 'deviation';
    };

export function assessRate(input: {
  price: number;
  /** The last price accepted, or null on a cold start. */
  lastKnownGood: number | null;
  bands: RateBands;
}): RateAssessment {
  const { price, lastKnownGood, bands } = input;

  // Checked first, and independently of history: a stored value that is itself
  // junk must not be able to launder the next one.
  if (price < bands.minPrice || price > bands.maxPrice) {
    return { ok: false, reason: 'implausible' };
  }

  // No history — a cold start, or a store that expired while nothing was
  // being sold. The absolute band still applied above; refusing to trade at
  // all because we can't cross-check would be worse than trading on a price
  // we can only bound.
  //
  // A non-positive reference is treated the same way rather than divided by.
  if (lastKnownGood === null || lastKnownGood <= 0) return { ok: true };

  if (bands.maxDeviationRatio <= 0) return { ok: true };

  const deviation = Math.abs(price - lastKnownGood) / lastKnownGood;
  if (deviation > bands.maxDeviationRatio) return { ok: false, reason: 'deviation' };

  return { ok: true };
}
