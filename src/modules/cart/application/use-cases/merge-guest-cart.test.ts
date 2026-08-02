import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { MergeGuestCart } from './merge-guest-cart';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

function makeFakeCarts(cartsByKey: Map<string, Cart>) {
  const deleted: string[] = [];
  const saved: Cart[] = [];
  const keyFor = (owner: { type: 'guest' | 'user'; sessionId?: string; userId?: string }) =>
    owner.type === 'guest' ? `guest:${owner.sessionId}` : `user:${owner.userId}`;
  const repo: CartRepository = {
    async get(owner) {
      return cartsByKey.get(keyFor(owner)) ?? null;
    },
    // Mirrors the repository's read-transform-write, so a use-case test
    // cannot pass against a fake that skips the step entirely.
    async mutate(owner, transform) {
      const current = await this.get(owner);
      const base = current ?? Cart.create({ id: 'fake-cart', owner, lines: [] });
      const next = transform(base);
      await this.save(next);
      return next;
    },
    async save(cart) {
      saved.push(cart);
      cartsByKey.set(keyFor(cart.owner), cart);
    },
    async delete(owner) {
      deleted.push(keyFor(owner));
      return cartsByKey.delete(keyFor(owner));
    },
  };
  return { repo, deleted, saved };
}

function makeCart(owner: { type: 'guest'; sessionId: string } | { type: 'user'; userId: string }, lines: CartLine[]) {
  return Cart.create({ id: randomUUID(), owner, lines });
}

describe('MergeGuestCart', () => {
  it('merges guest lines into the user cart and deletes the guest cart', async () => {
    const productA = randomUUID();
    const guestCart = makeCart({ type: 'guest', sessionId: 's1' }, [
      CartLine.create({ productId: productA, productName: 'Widget A', quantity: 1, unitPrice: Money.of(1000, 'USD') }),
    ]);
    const userCart = makeCart({ type: 'user', userId: 'user-1' }, []);
    const { repo, deleted, saved } = makeFakeCarts(
      new Map([
        ['guest:s1', guestCart],
        ['user:user-1', userCart],
      ]),
    );

    const merged = await new MergeGuestCart(repo).execute({ guestSessionId: 's1', userId: 'user-1' });

    expect(merged?.lines).toHaveLength(1);
    expect(merged?.owner).toEqual({ type: 'user', userId: 'user-1' });
    expect(deleted).toEqual(['guest:s1']);
    expect(saved).toHaveLength(1);
  });

  it('sums quantities on a product collision between guest and user carts', async () => {
    const productA = randomUUID();
    const guestCart = makeCart({ type: 'guest', sessionId: 's1' }, [
      CartLine.create({ productId: productA, productName: 'Widget A', quantity: 2, unitPrice: Money.of(1000, 'USD') }),
    ]);
    const userCart = makeCart({ type: 'user', userId: 'user-1' }, [
      CartLine.create({ productId: productA, productName: 'Widget A', quantity: 3, unitPrice: Money.of(1000, 'USD') }),
    ]);
    const { repo } = makeFakeCarts(
      new Map([
        ['guest:s1', guestCart],
        ['user:user-1', userCart],
      ]),
    );

    const merged = await new MergeGuestCart(repo).execute({ guestSessionId: 's1', userId: 'user-1' });

    expect(merged?.lines).toHaveLength(1);
    expect(merged?.lines[0]?.quantity).toBe(5); // 2 + 3
  });

  it('creates a new user cart when the user has none yet', async () => {
    const productA = randomUUID();
    const guestCart = makeCart({ type: 'guest', sessionId: 's1' }, [
      CartLine.create({ productId: productA, productName: 'Widget A', quantity: 1, unitPrice: Money.of(1000, 'USD') }),
    ]);
    const { repo } = makeFakeCarts(new Map([['guest:s1', guestCart]]));

    const merged = await new MergeGuestCart(repo).execute({ guestSessionId: 's1', userId: 'user-1' });

    expect(merged?.lines).toHaveLength(1);
    expect(merged?.owner).toEqual({ type: 'user', userId: 'user-1' });
  });

  it('returns the existing user cart unchanged when there is no guest cart', async () => {
    const userCart = makeCart({ type: 'user', userId: 'user-1' }, [
      CartLine.create({ productId: randomUUID(), productName: 'Widget X', quantity: 1, unitPrice: Money.of(500, 'USD') }),
    ]);
    const { repo, deleted } = makeFakeCarts(new Map([['user:user-1', userCart]]));

    const merged = await new MergeGuestCart(repo).execute({ guestSessionId: 'missing', userId: 'user-1' });

    expect(merged).toBe(userCart);
    expect(deleted).toEqual([]);
  });

  it('returns the existing user cart unchanged when the guest cart is empty', async () => {
    const emptyGuestCart = makeCart({ type: 'guest', sessionId: 's1' }, []);
    const userCart = makeCart({ type: 'user', userId: 'user-1' }, [
      CartLine.create({ productId: randomUUID(), productName: 'Widget X', quantity: 1, unitPrice: Money.of(500, 'USD') }),
    ]);
    const { repo, deleted } = makeFakeCarts(
      new Map([
        ['guest:s1', emptyGuestCart],
        ['user:user-1', userCart],
      ]),
    );

    const merged = await new MergeGuestCart(repo).execute({ guestSessionId: 's1', userId: 'user-1' });

    expect(merged).toBe(userCart);
    expect(deleted).toEqual([]); // never deletes when there was nothing to merge
  });
});
