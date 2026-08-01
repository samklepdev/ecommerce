import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { RepriceCart } from './reprice-cart';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeProduct(id: string, unitAmountMinor: number, name = `Widget ${id.slice(0, 4)}`) {
  return Product.create({
    id,
    slug: Slug.create(`widget-${id.slice(0, 4)}`),
    name,
    description: null,
    status: 'active',
    price: Money.of(unitAmountMinor, 'USD'),
  });
}

function makeFakeCarts(cart: Cart | null) {
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    async save() {},
    async delete() {
      return true;
    },
  };
  return repo;
}

function makeFakeProducts(productsById: Map<string, Product>) {
  const repo: Partial<ProductRepository> = {
    async findById(productId) {
      return productsById.get(productId) ?? null;
    },
  };
  return repo as ProductRepository;
}

describe('RepriceCart', () => {
  it('returns a zero subtotal and no stale products when there is no cart', async () => {
    const carts = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());

    const result = await new RepriceCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      currency: 'USD',
    });

    expect(result.subtotal.amountMinor).toBe(0);
    expect(result.staleProductIds).toEqual([]);
  });

  it('sums the current catalog price per line and flags drifted prices', async () => {
    const productA = randomUUID();
    const productB = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [
        CartLine.create({ productId: productA, productName: 'Widget A', quantity: 2, unitPrice: Money.of(1000, 'USD') }), // stale
        CartLine.create({ productId: productB, productName: 'Widget B', quantity: 1, unitPrice: Money.of(500, 'USD') }), // current
      ],
    });
    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(
      new Map([
        [productA, makeProduct(productA, 1500)], // catalog price drifted from cart's 1000
        [productB, makeProduct(productB, 500)], // unchanged
      ]),
    );

    const result = await new RepriceCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      currency: 'USD',
    });

    // Priced from the catalog: 1500*2 + 500*1 = 3500
    expect(result.subtotal.amountMinor).toBe(3500);
    expect(result.staleProductIds).toEqual([productA]);
  });

  it('skips lines whose product no longer exists in the catalog', async () => {
    const goneProduct = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId: goneProduct, productName: 'Gone Widget', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map());

    const result = await new RepriceCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      currency: 'USD',
    });

    expect(result.subtotal.amountMinor).toBe(0);
    expect(result.staleProductIds).toEqual([]);
  });
});
