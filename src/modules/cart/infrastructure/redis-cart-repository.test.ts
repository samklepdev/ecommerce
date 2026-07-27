import { describe, expect, it } from 'vitest';
import type Redis from 'ioredis';

import { RedisCartRepository } from './redis-cart-repository';
import type { CartOwner } from '@/modules/cart/domain/cart';

/** Just enough of ioredis to exercise the serialization boundary — no server,
 * in keeping with "domain and use-case tests run without infra". */
function makeFakeRedis(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const redis = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };
  return { redis: redis as unknown as Redis, store };
}

const owner: CartOwner = { type: 'guest', sessionId: 'sess-1' };
const key = 'cart:guest:sess-1';

describe('RedisCartRepository', () => {
  it('round-trips a cart', async () => {
    const { redis } = makeFakeRedis();
    const repo = new RedisCartRepository(redis);

    await redis.set(
      key,
      JSON.stringify({
        id: 'cart-1',
        lines: [
          { productId: 'p1', sku: 'SKU-1', quantity: 2, unitAmountMinor: 1000, currency: 'USD' },
        ],
      }),
    );

    const cart = await repo.get(owner);
    expect(cart?.lines).toHaveLength(1);
    expect(cart?.lines[0]?.productId).toBe('p1');
    expect(cart?.lines[0]?.quantity).toBe(2);
  });

  // Removing variants changed what a cart line points at. A cart written
  // before that holds ids of rows that no longer exist, so it can't be
  // re-priced or checked out — better an empty cart than lines that fail.
  it('discards a cart stored in the pre-variant-removal shape', async () => {
    const { redis, store } = makeFakeRedis({
      [key]: JSON.stringify({
        id: 'cart-old',
        lines: [
          { variantId: 'v1', sku: 'SKU-1', quantity: 1, unitAmountMinor: 1000, currency: 'USD' },
        ],
      }),
    });
    const repo = new RedisCartRepository(redis);

    expect(await repo.get(owner)).toBeNull();
    // Dropped, so the next read doesn't have to make the same decision again.
    expect(store.has(key)).toBe(false);
  });

  it('returns null when there is no cart at all', async () => {
    const { redis } = makeFakeRedis();
    expect(await new RedisCartRepository(redis).get(owner)).toBeNull();
  });
});
