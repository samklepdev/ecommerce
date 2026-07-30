import { describe, expect, it } from 'vitest';

import { RedisAddressIndexAllocator } from './redis-address-index-allocator';
import { useTestInfrastructure } from '../../../../../tests/integration/harness';

/**
 * The invariant this file exists for: **no two orders ever get the same
 * address index.**
 *
 * Reusing a BTC address destroys order↔payment correlation and publishes
 * revenue history on-chain, and it is the kind of failure that only appears
 * under concurrency — which is exactly what a fake Redis can't reproduce.
 * These run against the real server, where INCR's atomicity is a property of
 * Redis rather than of our mock.
 */
describe('RedisAddressIndexAllocator (integration)', () => {
  const { redis } = useTestInfrastructure();
  const allocator = () => new RedisAddressIndexAllocator(redis);

  it('hands out 0 first, and counts up from there', async () => {
    const a = allocator();

    expect(await a.next()).toBe(0);
    expect(await a.next()).toBe(1);
    expect(await a.next()).toBe(2);
  });

  it('never hands the same index to two concurrent callers', async () => {
    const a = allocator();

    // Fired together rather than awaited in turn: sequential calls would
    // pass even with a read-then-write implementation, which is the bug.
    const indexes = await Promise.all(Array.from({ length: 200 }, () => a.next()));

    expect(new Set(indexes).size).toBe(200);
    expect(Math.min(...indexes)).toBe(0);
    expect(Math.max(...indexes)).toBe(199);
  });

  it('stays distinct across separate allocator instances on the same key', async () => {
    // Two app instances, one counter — the deployment this must survive.
    const [first, second] = [allocator(), allocator()];

    const indexes = await Promise.all([
      ...Array.from({ length: 50 }, () => first.next()),
      ...Array.from({ length: 50 }, () => second.next()),
    ]);

    expect(new Set(indexes).size).toBe(100);
  });

  describe('seedFloor', () => {
    it('raises the counter so the next index clears the floor', async () => {
      const a = allocator();

      await a.seedFloor(500);

      expect(await a.next()).toBe(500);
    });

    it('never lowers a counter that is already higher', async () => {
      const a = allocator();
      await a.seedFloor(500);
      await a.next(); // now at 501

      await a.seedFloor(10);

      // Lowering it is how an address gets reused, so a stale seed on a
      // restart must be a no-op rather than a rollback.
      expect(await a.next()).toBe(501);
    });

    it('is idempotent — re-seeding the same floor changes nothing', async () => {
      const a = allocator();

      await a.seedFloor(300);
      await a.seedFloor(300);
      await a.seedFloor(300);

      expect(await a.next()).toBe(300);
    });

    it('holds the floor against concurrent allocation', async () => {
      const a = allocator();

      // A seed racing live checkouts: whatever interleaving occurs, no index
      // may be issued twice.
      const results = await Promise.all([
        ...Array.from({ length: 40 }, () => a.next()),
        a.seedFloor(1_000),
        ...Array.from({ length: 40 }, () => a.next()),
      ]);

      const indexes = results.filter((r): r is number => typeof r === 'number');
      expect(new Set(indexes).size).toBe(indexes.length);
    });
  });
});
