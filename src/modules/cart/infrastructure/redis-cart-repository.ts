import type Redis from 'ioredis';

import { Money } from '@/shared/domain/money';
import { Cart, type CartOwner } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

interface StoredLine {
  productId: string;
  sku: string;
  quantity: number;
  unitAmountMinor: number;
  currency: string;
}

interface StoredCart {
  id: string;
  lines: StoredLine[];
}

const GUEST_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function keyFor(owner: CartOwner): string {
  return owner.type === 'guest' ? `cart:guest:${owner.sessionId}` : `cart:user:${owner.userId}`;
}

export class RedisCartRepository implements CartRepository {
  constructor(private readonly redis: Redis) {}

  async get(owner: CartOwner): Promise<Cart | null> {
    const raw = await this.redis.get(keyFor(owner));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredCart;

    // Carts written before variants were removed store a `variantId` holding
    // a product_variants id — a row that no longer exists, so the line can't
    // be re-priced or ordered. There's nothing to migrate it to from here, and
    // a cart is cheap to rebuild, so drop it rather than hand back lines that
    // would fail at checkout.
    if (stored.lines.some((l) => typeof l.productId !== 'string')) {
      await this.delete(owner);
      return null;
    }

    return Cart.create({
      id: stored.id,
      owner,
      lines: stored.lines.map((l) =>
        CartLine.create({
          productId: l.productId,
          sku: l.sku,
          quantity: l.quantity,
          unitPrice: Money.of(l.unitAmountMinor, l.currency),
        }),
      ),
    });
  }

  async save(cart: Cart): Promise<void> {
    const stored: StoredCart = {
      id: cart.id,
      lines: cart.lines.map((l) => ({
        productId: l.productId,
        sku: l.sku,
        quantity: l.quantity,
        unitAmountMinor: l.unitPrice.amountMinor,
        currency: l.unitPrice.currency,
      })),
    };
    const key = keyFor(cart.owner);
    const payload = JSON.stringify(stored);
    if (cart.owner.type === 'guest') {
      await this.redis.set(key, payload, 'EX', GUEST_TTL_SECONDS);
    } else {
      await this.redis.set(key, payload);
    }
  }

  async delete(owner: CartOwner): Promise<void> {
    await this.redis.del(keyFor(owner));
  }
}
