import { describe, expect, it } from 'vitest';

import { RedisCartRepository } from './redis-cart-repository';
import type { CartOwner } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Money } from '@/shared/domain/money';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * Cart mutations under concurrency, against real Redis.
 *
 * Every change used to be `get()` then `save()` from the use case, rewriting
 * the whole document. Two overlapping requests both read the same cart and
 * both wrote their own version, so the later write erased the earlier one and
 * the customer just didn't see an item they had added.
 *
 * That is invisible to a fake repository — a JavaScript Map applies writes one
 * at a time, so a lost update can't happen there. It needs a real server and
 * real interleaving.
 */
describe('RedisCartRepository#mutate (integration)', () => {
  const { redis } = useTestInfrastructure();
  const repo = () => new RedisCartRepository(redis);

  let n = 0;
  function owner(): CartOwner {
    n += 1;
    return { type: 'guest', sessionId: `mutate-session-${n}` };
  }

  function line(productId: string, quantity = 1) {
    return CartLine.create({
      productId,
      productName: `Product ${productId}`,
      quantity,
      unitPrice: Money.of(1000, 'USD'),
    });
  }

  it('applies a transform to an empty cart', async () => {
    const o = owner();

    const result = await repo().mutate(o, (cart) => cart.addLine(line('a')));

    expect(result.lines.map((l) => l.productId)).toEqual(['a']);
    expect((await repo().get(o))?.lines).toHaveLength(1);
  });

  it('applies a transform to an existing cart', async () => {
    const o = owner();
    await repo().mutate(o, (cart) => cart.addLine(line('a')));

    await repo().mutate(o, (cart) => cart.addLine(line('b')));

    const stored = await repo().get(o);
    expect(stored?.lines.map((l) => l.productId).sort()).toEqual(['a', 'b']);
  });

  /**
   * The defect, reproduced. Ten different products added at once: with
   * read-modify-write, all ten read the empty cart and the last write wins,
   * leaving one line. Every one has to survive.
   */
  it('loses nothing when many different products are added at once', async () => {
    const o = owner();
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);

    await Promise.all(ids.map((id) => repo().mutate(o, (cart) => cart.addLine(line(id)))));

    const stored = await repo().get(o);
    expect(stored?.lines.map((l) => l.productId).sort()).toEqual([...ids].sort());
  });

  it('sums concurrent adds of the same product rather than dropping them', async () => {
    // `Cart.addLine` sums on collision, so five concurrent adds of one item
    // must land on five — not one, and not somewhere in between.
    const o = owner();

    await Promise.all(
      Array.from({ length: 5 }, () => repo().mutate(o, (cart) => cart.addLine(line('a')))),
    );

    const stored = await repo().get(o);
    expect(stored?.lines).toHaveLength(1);
    expect(stored?.lines[0]?.quantity).toBe(5);
  });

  it('still honours the domain quantity cap under concurrency', async () => {
    // The clamp lives in `Cart.addLine`, which is exactly why the transform is
    // a domain call and not a Lua script: one implementation of the rule.
    const o = owner();

    await Promise.all(
      Array.from({ length: 30 }, () => repo().mutate(o, (cart) => cart.addLine(line('a', 10)))),
    );

    expect((await repo().get(o))?.lines[0]?.quantity).toBe(99);
  });

  it('interleaves adds and removals without resurrecting a removed line', async () => {
    const o = owner();
    await repo().mutate(o, (cart) => cart.addLine(line('a')).addLine(line('b')));

    await Promise.all([
      repo().mutate(o, (cart) => cart.removeLine('a')),
      repo().mutate(o, (cart) => cart.addLine(line('c'))),
    ]);

    const stored = await repo().get(o);
    expect(stored?.lines.map((l) => l.productId).sort()).toEqual(['b', 'c']);
  });

  it('keeps the guest TTL, so abandoned carts still expire', async () => {
    const o = owner();

    await repo().mutate(o, (cart) => cart.addLine(line('a')));

    const ttl = await redis.ttl(`cart:guest:${(o as { sessionId: string }).sessionId}`);
    expect(ttl).toBeGreaterThan(0);
  });

  it('does not write a key for a transform that leaves the cart empty', async () => {
    // Removing the last line of a cart that never existed should not mint an
    // empty document that then sits in Redis for thirty days.
    const o = owner();

    await repo().mutate(o, (cart) => cart.removeLine('nothing'));

    expect(await repo().get(o)).toBeNull();
  });
});
