import { describe, expect, it } from 'vitest';

import { RedisSessionStore } from './redis-session-store';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * Both clocks, and the sliding refresh, against real Redis.
 *
 * The idle timeout is only real because the key's TTL enforces it — an idle
 * session has to disappear whether or not anything reads it again. That's a
 * property of Redis, not of our code, so it can only be tested here.
 */
describe('RedisSessionStore (integration)', () => {
  const { redis } = useTestInfrastructure();

  /** A store whose clock the test controls. */
  const storeAt = (now: () => Date) => new RedisSessionStore(redis, 'session:', now);

  const T0 = new Date('2026-07-30T12:00:00.000Z');
  const at = (msFromT0: number) => new Date(T0.getTime() + msFromT0);
  const minutes = (n: number) => n * 60_000;

  it('creates a session that reads back, with sudo mode already started', async () => {
    const store = storeAt(() => T0);

    const created = await store.create('user-1', { ttlSeconds: 3600, idleTimeoutSeconds: 900 });
    const loaded = await store.get(created.id);

    expect(loaded?.userId).toBe('user-1');
    // Logging in *is* typing the password.
    expect(loaded?.hasRecentAuthAt(900, T0)).toBe(true);
  });

  it('sets the key TTL to whichever clock runs out first', async () => {
    const store = storeAt(() => T0);

    const shortIdle = await store.create('u', { ttlSeconds: 3600, idleTimeoutSeconds: 900 });
    const shortAbsolute = await store.create('u', { ttlSeconds: 300, idleTimeoutSeconds: 900 });

    // Idle window is shorter → TTL is the idle window.
    expect(await redis.ttl(`session:${shortIdle.id}`)).toBeLessThanOrEqual(900);
    expect(await redis.ttl(`session:${shortIdle.id}`)).toBeGreaterThan(880);
    // Absolute is shorter → TTL is what's left of it.
    expect(await redis.ttl(`session:${shortAbsolute.id}`)).toBeLessThanOrEqual(300);
  });

  it('refuses a session that has gone idle, and deletes it', async () => {
    let now = T0;
    const store = storeAt(() => now);
    const session = await store.create('u', { ttlSeconds: 86_400, idleTimeoutSeconds: 900 });

    now = at(minutes(16));

    expect(await store.get(session.id)).toBeNull();
    // Not merely hidden: the record is gone, so the same judgement isn't
    // re-made on every later read.
    expect(await redis.exists(`session:${session.id}`)).toBe(0);
  });

  it('refuses a session past its absolute expiry however recently it was used', async () => {
    let now = T0;
    const store = storeAt(() => now);
    const session = await store.create('u', { ttlSeconds: 600, idleTimeoutSeconds: 86_400 });

    // Active two minutes ago, but the ceiling has passed.
    now = at(minutes(9));
    await store.get(session.id);
    now = at(minutes(11));

    expect(await store.get(session.id)).toBeNull();
  });

  describe('the sliding window', () => {
    it('pushes the idle deadline out when the session is used', async () => {
      let now = T0;
      const store = storeAt(() => now);
      const session = await store.create('u', { ttlSeconds: 86_400, idleTimeoutSeconds: 900 });

      // Used at 10 minutes: within the window, so it survives...
      now = at(minutes(10));
      expect(await store.get(session.id)).not.toBeNull();

      // ...and at 20 minutes it's still alive, which it would not be if the
      // window ran from login rather than last activity.
      now = at(minutes(20));
      expect(await store.get(session.id)).not.toBeNull();
    });

    it('never slides past the absolute expiry', async () => {
      let now = T0;
      const store = storeAt(() => now);
      const session = await store.create('u', { ttlSeconds: 1_200, idleTimeoutSeconds: 900 });

      now = at(minutes(10));
      await store.get(session.id);

      // 10 minutes left on the ceiling, so the refreshed TTL must not be the
      // full 15-minute idle window.
      const ttl = await redis.ttl(`session:${session.id}`);
      expect(ttl).toBeLessThanOrEqual(600);
    });

    it('does not write on every read', async () => {
      let now = T0;
      const store = storeAt(() => now);
      const session = await store.create('u', { ttlSeconds: 86_400, idleTimeoutSeconds: 900 });
      const before = await redis.get(`session:${session.id}`);

      // Two reads a second apart: Redis is on every request path here, so
      // this must not be two writes.
      now = at(1_000);
      await store.get(session.id);
      await store.get(session.id);

      expect(await redis.get(`session:${session.id}`)).toBe(before);
    });
  });

  describe('markReauthenticated', () => {
    it('restarts the sudo window without touching the absolute expiry', async () => {
      let now = T0;
      const store = storeAt(() => now);
      const session = await store.create('u', { ttlSeconds: 3_600, idleTimeoutSeconds: 1_800 });
      const originalExpiry = session.expiresAt.getTime();

      now = at(minutes(20));
      expect((await store.get(session.id))?.hasRecentAuthAt(900, now)).toBe(false);

      await store.markReauthenticated(session.id);

      const after = await store.get(session.id);
      expect(after?.hasRecentAuthAt(900, now)).toBe(true);
      expect(after?.expiresAt.getTime()).toBe(originalExpiry);
    });

    it('is a no-op on a session that no longer exists', async () => {
      const store = storeAt(() => T0);

      await expect(store.markReauthenticated('never-existed')).resolves.toBeUndefined();
    });
  });

  // Sessions written before the idle clock existed are still in Redis on the
  // deploy that adds it. Signing everyone out is a worse answer than
  // adopting them.
  it('adopts a legacy record that has no idle fields', async () => {
    const store = storeAt(() => T0);
    await redis.set(
      'session:legacy',
      JSON.stringify({ userId: 'u', expiresAt: at(minutes(60)).toISOString() }),
      'EX',
      3600,
    );

    const loaded = await store.get('legacy');

    expect(loaded?.userId).toBe('u');
    expect(loaded?.isValidAt(T0)).toBe(true);
  });

  it('drops an unreadable record rather than re-reading it forever', async () => {
    const store = storeAt(() => T0);
    await redis.set('session:corrupt', 'not json at all', 'EX', 3600);

    expect(await store.get('corrupt')).toBeNull();
    expect(await redis.exists('session:corrupt')).toBe(0);
  });
});
