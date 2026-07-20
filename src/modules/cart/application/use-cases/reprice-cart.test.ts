import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { RepriceCart } from './reprice-cart';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { ProductVariant } from '@/modules/catalog/domain/product-variant';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeVariant(id: string, unitAmountMinor: number) {
  return ProductVariant.create({
    id,
    productId: randomUUID(),
    sku: `SKU-${id.slice(0, 4)}`,
    name: 'Default',
    price: Money.of(unitAmountMinor, 'USD'),
  });
}

function makeFakeCarts(cart: Cart | null) {
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    async save() {},
    async delete() {},
  };
  return repo;
}

function makeFakeProducts(variantsById: Map<string, ProductVariant>) {
  const repo: Partial<ProductRepository> = {
    async findVariantById(variantId) {
      return variantsById.get(variantId) ?? null;
    },
  };
  return repo as ProductRepository;
}

describe('RepriceCart', () => {
  it('returns a zero subtotal and no stale variants when there is no cart', async () => {
    const carts = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());

    const result = await new RepriceCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      currency: 'USD',
    });

    expect(result.subtotal.amountMinor).toBe(0);
    expect(result.staleVariantIds).toEqual([]);
  });

  it('sums the current catalog price per line and flags drifted prices', async () => {
    const variantA = randomUUID();
    const variantB = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [
        CartLine.create({ variantId: variantA, sku: 'A', quantity: 2, unitPrice: Money.of(1000, 'USD') }), // stale
        CartLine.create({ variantId: variantB, sku: 'B', quantity: 1, unitPrice: Money.of(500, 'USD') }), // current
      ],
    });
    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(
      new Map([
        [variantA, makeVariant(variantA, 1500)], // catalog price drifted from cart's 1000
        [variantB, makeVariant(variantB, 500)], // unchanged
      ]),
    );

    const result = await new RepriceCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      currency: 'USD',
    });

    // Priced from the catalog: 1500*2 + 500*1 = 3500
    expect(result.subtotal.amountMinor).toBe(3500);
    expect(result.staleVariantIds).toEqual([variantA]);
  });

  it('skips lines whose variant no longer exists in the catalog', async () => {
    const goneVariant = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ variantId: goneVariant, sku: 'GONE', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map());

    const result = await new RepriceCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      currency: 'USD',
    });

    expect(result.subtotal.amountMinor).toBe(0);
    expect(result.staleVariantIds).toEqual([]);
  });
});
