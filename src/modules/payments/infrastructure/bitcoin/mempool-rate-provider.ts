import type { BtcRateProvider } from '@/modules/payments/application/ports/bitcoin-ports';
import { parseBtcPrice } from './rate-response';

const SATS_PER_BTC = 100_000_000;

/**
 * How long to wait for the price feed before giving up.
 *
 * Bare `fetch` has effectively no request timeout — undici only applies a
 * 300-second headers timeout — so a feed that accepts the connection and then
 * goes quiet used to hang `createPayment`, which hangs the checkout server
 * action, with the cart already claimed and the order already written. Five
 * seconds is far longer than a healthy feed needs and far shorter than a
 * customer will wait.
 */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * fiat -> sats using a public BTC price feed (mempool.space by default).
 * Cached briefly so a burst of checkouts doesn't hammer the feed; the quote is
 * locked per-order at checkout anyway, so a few seconds of staleness is fine.
 *
 * Says nothing about whether the number is *sensible* — that is
 * `SanityCheckedRateProvider`, which wraps this. For production, point this at
 * your own node or a paid feed.
 */
export class MempoolRateProvider implements BtcRateProvider {
  private cache = new Map<string, { satsPerUnit: number; at: number }>();

  constructor(
    private readonly baseUrl = 'https://mempool.space/api',
    private readonly ttlMs = 30_000,
  ) {}

  async satsPerFiatUnit(currency: string): Promise<number> {
    const cur = currency.toUpperCase();
    const hit = this.cache.get(cur);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.satsPerUnit;

    const res = await fetch(`${this.baseUrl}/v1/prices`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`rate feed HTTP ${res.status}`);
    // Parsed, not cast: this number decides how many satoshis the customer
    // is asked to send.
    const btcPrice = parseBtcPrice(await res.json(), cur);

    // e.g. BTC = $60,000 -> 100_000_000 / 60000 ≈ 1666.67 sats per USD
    const satsPerUnit = SATS_PER_BTC / btcPrice;
    this.cache.set(cur, { satsPerUnit, at: Date.now() });
    return satsPerUnit;
  }
}
