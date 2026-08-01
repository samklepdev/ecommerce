import type Redis from 'ioredis';

import type { LastKnownRateStore } from '@/modules/payments/application/ports/bitcoin-ports';

/** How long a reference price stays usable.
 *
 * Long enough to survive a deploy or a quiet night, short enough that a stale
 * reference can't reject genuine market movement: BTC can plausibly move 25%
 * over weeks, so a reference from weeks ago would refuse every correct rate.
 * In normal operation this is rewritten every time a rate is accepted, so it
 * is only ever seconds old — the TTL matters after downtime. */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/**
 * Remembers the last BTC price we were willing to quote from.
 *
 * Redis rather than memory because the check has to survive a restart. A
 * process that boots straight into a corrupt feed has no history to compare
 * against, which is exactly the moment it would otherwise accept anything —
 * and a deploy during an incident is not unlikely.
 *
 * Losing the key is safe by design: the absolute plausibility band still
 * applies and the shop keeps trading, it just can't cross-check against the
 * recent past until the next accepted rate rebuilds it.
 */
export class RedisLastKnownRateStore implements LastKnownRateStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = DEFAULT_TTL_SECONDS,
  ) {}

  private keyFor(currency: string): string {
    return `btc:rate:last-known:${currency.toUpperCase()}`;
  }

  async get(currency: string): Promise<number | null> {
    const raw = await this.redis.get(this.keyFor(currency));
    if (raw === null) return null;

    // Parsed, not trusted. This value decides whether a rate is accepted, and
    // it came back off the wire as a string — a corrupted or hand-edited key
    // must read as "no history" rather than as NaN, which compares false
    // against every band and would silently disable the deviation check.
    const price = Number(raw);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  async set(currency: string, price: number): Promise<void> {
    await this.redis.set(this.keyFor(currency), String(price), 'EX', this.ttlSeconds);
  }
}
