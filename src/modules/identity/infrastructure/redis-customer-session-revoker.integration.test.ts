import { describe, expect, it } from 'vitest';

import { RedisCustomerSessionRevoker } from './redis-customer-session-revoker';
import { RedisSessionStore } from './redis-session-store';
import { makeUser } from '../../../../tests/integration/factories';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * Closing the store signs every customer out and keeps every admin in.
 *
 * The whole thing is a Redis keyspace walk joined against roles in Postgres,
 * so it only means anything against both. Getting it backwards would either
 * leave customers signed in through a closure, or lock the operator out of
 * the console they reopen it from.
 */
describe('RedisCustomerSessionRevoker (integration)', () => {
  const { db, redis } = useTestInfrastructure();
  const revoker = () => new RedisCustomerSessionRevoker(redis, db);
  const sessions = () => new RedisSessionStore(redis);

  it('destroys customer sessions and leaves admin sessions alone', async () => {
    const [alice, bob, admin] = await Promise.all([
      makeUser(db, { role: 'customer' }),
      makeUser(db, { role: 'customer' }),
      makeUser(db, { role: 'admin' }),
    ]);
    const store = sessions();
    const [aliceSession, bobSession, adminSession] = await Promise.all([
      store.create(alice.id, 3600),
      store.create(bob.id, 3600),
      store.create(admin.id, 3600),
    ]);

    const revoked = await revoker().revokeAllCustomerSessions();

    expect(revoked).toBe(2);
    expect(await store.get(aliceSession.id)).toBeNull();
    expect(await store.get(bobSession.id)).toBeNull();
    expect((await store.get(adminSession.id))?.userId).toBe(admin.id);
  });

  it('revokes every one of a customer’s sessions, not just the newest', async () => {
    const customer = await makeUser(db, { role: 'customer' });
    const store = sessions();
    // Phone, laptop, and a browser they forgot about.
    const created = await Promise.all([
      store.create(customer.id, 3600),
      store.create(customer.id, 3600),
      store.create(customer.id, 3600),
    ]);

    expect(await revoker().revokeAllCustomerSessions()).toBe(3);
    for (const session of created) {
      expect(await store.get(session.id)).toBeNull();
    }
  });

  it('is a no-op when nobody is signed in', async () => {
    expect(await revoker().revokeAllCustomerSessions()).toBe(0);
  });

  it('leaves unrelated Redis keys untouched', async () => {
    const customer = await makeUser(db, { role: 'customer' });
    await sessions().create(customer.id, 3600);
    await redis.set('cart:guest:abc', '{"lines":[]}');
    await redis.set('btc:addr:next-index', '42');

    await revoker().revokeAllCustomerSessions();

    // The scan is `session:*` for a reason — carts and the address counter
    // are on the same server, and the counter must never be reset.
    expect(await redis.get('cart:guest:abc')).toBe('{"lines":[]}');
    expect(await redis.get('btc:addr:next-index')).toBe('42');
  });

  // SCAN returns keys in batches; a naive implementation that only handled
  // the first cursor page would quietly leave most people signed in.
  it('walks past a single SCAN page', async () => {
    const customer = await makeUser(db, { role: 'customer' });
    const store = sessions();
    await Promise.all(Array.from({ length: 500 }, () => store.create(customer.id, 3600)));

    expect(await revoker().revokeAllCustomerSessions()).toBe(500);
    expect(await redis.keys('session:*')).toHaveLength(0);
  });

  it('treats a session whose user no longer exists as a customer session', async () => {
    // Deleted account, session still in Redis until its TTL. Not an admin,
    // so it goes — the safe reading of an unknown holder.
    const store = sessions();
    await store.create('a-user-id-that-was-deleted', 3600);

    expect(await revoker().revokeAllCustomerSessions()).toBe(1);
  });
});
