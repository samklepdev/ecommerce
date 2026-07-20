import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { AddToCart } from './add-to-cart';
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
  const saved: Cart[] = [];
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    async save(c) {
      saved.push(c);
    },
    async delete() {},
  };
  return { repo, saved };
}

function makeFakeProducts(variantsById: Map<string, ProductVariant>) {
  const repo: Partial<ProductRepository> = {
    async findVariantById(variantId) {
      return variantsById.get(variantId) ?? null;
    },
  };
  return repo as ProductRepository;
}

describe('AddToCart', () => {
  it('creates a new cart when none exists yet', async () => {
    const variantId = randomUUID();
    const variant = makeVariant(variantId, 1000);
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map([[variantId, variant]]));

    const result = await new AddToCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      variantId,
      quantity: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines).toHaveLength(1);
      expect(result.value.lines[0]?.quantity).toBe(2);
    }
    expect(saved).toHaveLength(1);
  });

  it('merges quantity into an existing line for the same variant', async () => {
    const variantId = randomUUID();
    const variant = makeVariant(variantId, 1000);
    const existingCart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ variantId, sku: variant.sku, quantity: 1, unitPrice: variant.price })],
    });
    const { repo: carts, saved } = makeFakeCarts(existingCart);
    const products = makeFakeProducts(new Map([[variantId, variant]]));

    const result = await new AddToCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      variantId,
      quantity: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines).toHaveLength(1);
      expect(result.value.lines[0]?.quantity).toBe(3); // 1 + 2
    }
    expect(saved).toHaveLength(1);
  });

  it('returns variant_not_found when the variant is not in the catalog', async () => {
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());

    const result = await new AddToCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      variantId: randomUUID(),
      quantity: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('variant_not_found');
    expect(saved).toHaveLength(0);
  });
});
