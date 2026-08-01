import { describe, expect, it } from 'vitest';

import { RedisLastKnownRateStore } from './redis-last-known-rate-store';
import { useTestInfrastructure } from '../../../../../tests/integration/harness';

/**
 * The reference price the rate sanity check compares against.
 *
 * Against real Redis because the behaviour that matters is Redis' own: values
 * come back as strings, keys expire, and a missing key has to be
 * indistinguishable from "no history" rather than from zero. A fake would
 * return whatever JavaScript value it was handed and prove none of that.
 */
describe('RedisLastKnownRateStore (integration)', () => {
  const { redis } = useTestInfrastructure();
  const store = (ttlSeconds?: number) => new RedisLastKnownRateStore(redis, ttlSeconds);

  it('reports no history for a currency it has never seen', async () => {
    expect(await store().get('USD')).toBeNull();
  });

  it('round-trips a price through Redis as a number, not a string', async () => {
    // The failure this guards: `'60000'` compares and divides by coercion in
    // some places and not others, so a string that "works" in a test can
    // still make the deviation maths wrong.
    await store().set('USD', 60_000);

    const read = await store().get('USD');
    expect(read).toBe(60_000);
    expect(typeof read).toBe('number');
  });

  it('preserves a fractional price', async () => {
    await store().set('USD', 61234.56789);
    expect(await store().get('USD')).toBeCloseTo(61234.56789, 5);
  });

  it('overwrites rather than accumulating', async () => {
    await store().set('USD', 60_000);
    await store().set('USD', 61_000);
    expect(await store().get('USD')).toBe(61_000);
  });

  it('keeps currencies apart', async () => {
    await store().set('USD', 60_000);
    await store().set('EUR', 55_000);

    expect(await store().get('USD')).toBe(60_000);
    expect(await store().get('EUR')).toBe(55_000);
  });

  it('treats the currency case-insensitively', async () => {
    await store().set('usd', 60_000);
    expect(await store().get('USD')).toBe(60_000);
  });

  it('expires, so a stale reference cannot reject genuine market movement', async () => {
    await store(1).set('USD', 60_000);
    expect(await store(1).get('USD')).toBe(60_000);

    await new Promise((r) => setTimeout(r, 1_200));

    // Reads as "no history", which degrades to the absolute band rather than
    // refusing every rate that has legitimately moved since.
    expect(await store().get('USD')).toBeNull();
  });

  it('reads a corrupted value as no history rather than as NaN', async () => {
    // A hand-edited or half-written key must not silently disable the
    // deviation check — NaN compares false against every band, so it would
    // accept anything while looking like it was checking.
    await redis.set('btc:rate:last-known:USD', 'not-a-number');

    expect(await store().get('USD')).toBeNull();
  });

  it('reads a non-positive value as no history rather than dividing by it', async () => {
    await redis.set('btc:rate:last-known:USD', '0');
    expect(await store().get('USD')).toBeNull();

    await redis.set('btc:rate:last-known:USD', '-100');
    expect(await store().get('USD')).toBeNull();
  });
});
