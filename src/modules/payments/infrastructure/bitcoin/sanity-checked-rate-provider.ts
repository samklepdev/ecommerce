import { logger } from '@/shared/infrastructure/logger';
import type {
  BtcRateProvider,
  LastKnownRateStore,
} from '@/modules/payments/application/ports/bitcoin-ports';
import { assessRate, type RateBands } from '@/modules/payments/domain/rate-sanity';

const SATS_PER_BTC = 100_000_000;

/**
 * Refuses to quote from a BTC price that doesn't look like one.
 *
 * A decorator rather than a change to `MempoolRateProvider`, so the thing that
 * fetches and the thing that judges stay separable — a second feed, or a
 * cross-checking provider, wraps the same way.
 *
 * **Fails closed.** An unquotable rate throws, which surfaces as
 * `gateway_error` and a "try again" at checkout. That is the right trade: a
 * brief inability to take orders costs a sale, while quoting from a bad number
 * either kills checkout silently (price too low, invoices nobody can pay) or
 * ships goods for a fraction of a cent (price too high) — and bitcoin is
 * irreversible with no refund mechanism here.
 *
 * The store is best-effort in both directions. Redis being unavailable must
 * not stop the shop trading, so a failed read degrades to the absolute band
 * alone and a failed write costs the *next* call its reference rather than
 * costing this customer their checkout.
 */
export class SanityCheckedRateProvider implements BtcRateProvider {
  constructor(
    private readonly inner: BtcRateProvider,
    private readonly lastKnown: LastKnownRateStore,
    private readonly bands: RateBands,
  ) {}

  async satsPerFiatUnit(currency: string): Promise<number> {
    const satsPerUnit = await this.inner.satsPerFiatUnit(currency);

    // Back to the price of one BTC, which is the unit the bands are expressed
    // in and the one a human can sanity-check by eye. Guarded first: 0 or a
    // non-finite value would make the conversion nonsense before any band
    // could look at it.
    if (!Number.isFinite(satsPerUnit) || satsPerUnit <= 0) {
      throw new Error(`rate feed returned an unusable rate for ${currency}: ${satsPerUnit}`);
    }
    const price = SATS_PER_BTC / satsPerUnit;

    const lastKnownGood = await this.readLastKnownGood(currency);
    const assessment = assessRate({ price, lastKnownGood, bands: this.bands });

    if (!assessment.ok) {
      // Loud: every checkout is failing while this is true, and the cause is
      // outside the app. Both figures are logged because the useful question
      // is which of the two is wrong.
      logger.error('refusing to quote from an unsafe BTC rate', {
        currency,
        price,
        lastKnownGood,
        reason: assessment.reason,
      });
      throw new Error(
        assessment.reason === 'implausible'
          ? `BTC price for ${currency} is implausible (${price}); refusing to quote`
          : `BTC price for ${currency} deviates too far from the last accepted rate; refusing to quote`,
      );
    }

    // Only an accepted price becomes the reference. Storing a rejected one
    // would let a single bad reading redefine normal, after which every
    // correct rate looks like the deviation.
    await this.rememberLastKnownGood(currency, price);

    return satsPerUnit;
  }

  private async readLastKnownGood(currency: string): Promise<number | null> {
    try {
      return await this.lastKnown.get(currency);
    } catch (e) {
      logger.warn('could not read the last known BTC rate; falling back to the absolute band', {
        currency,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private async rememberLastKnownGood(currency: string, price: number): Promise<void> {
    try {
      await this.lastKnown.set(currency, price);
    } catch (e) {
      logger.warn('could not record the last known BTC rate', {
        currency,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
