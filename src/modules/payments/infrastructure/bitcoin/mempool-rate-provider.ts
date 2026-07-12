import type { BtcRateProvider } from '@/modules/payments/application/ports/bitcoin-ports';

const SATS_PER_BTC = 100_000_000;

/**
 * fiat -> sats using a public BTC price feed (mempool.space by default).
 * Cached briefly so a burst of checkouts doesn't hammer the feed; the quote is
 * locked per-order at checkout anyway, so a few seconds of staleness is fine.
 *
 * For production, point this at your own node / a paid feed, and consider
 * multiple sources with a sanity check — a bad rate misprices every order.
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

    const res = await fetch(`${this.baseUrl}/v1/prices`);
    if (!res.ok) throw new Error(`rate feed HTTP ${res.status}`);
    const prices = (await res.json()) as Record<string, number>;

    const btcPrice = prices[cur];
    if (!btcPrice || btcPrice <= 0) {
      throw new Error(`no BTC price for currency ${cur}`);
    }

    // e.g. BTC = $60,000 -> 100_000_000 / 60000 ≈ 1666.67 sats per USD
    const satsPerUnit = SATS_PER_BTC / btcPrice;
    this.cache.set(cur, { satsPerUnit, at: Date.now() });
    return satsPerUnit;
  }
}
