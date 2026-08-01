import { describe, expect, it } from 'vitest';

import { GetProductsByIds } from './get-products-by-ids';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { Product } from '@/modules/catalog/domain/product';

describe('GetProductsByIds', () => {
  it('returns an empty array without querying the repository when given no ids', async () => {
    let called = false;
    const repo: Partial<ProductRepository> = {
      async findByIds() {
        called = true;
        return [];
      },
    };

    const result = await new GetProductsByIds(repo as ProductRepository).execute({ productIds: [] });

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it('delegates to the repository for a normal id list', async () => {
    const repo: Partial<ProductRepository> = {
      async findByIds(ids) {
        return ids.map((id) => ({ id }) as Product);
      },
    };

    const result = await new GetProductsByIds(repo as ProductRepository).execute({
      productIds: ['a', 'b'],
    });

    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  /**
   * This used to silently slice the list to 8 — a bound that belonged to the
   * one caller that needed it (recently-viewed, which still enforces its own
   * `.max(8)` in Zod) and was quietly imposed on every other.
   *
   * The checkout summary passes every cart line through here. Past the eighth,
   * `findByIds` never saw the id, so `repriceCartForDisplay` fell back to the
   * add-to-cart snapshot *and* flagged the line unavailable: the customer was
   * shown a stale price, a subtotal that didn't match `/cart`, and a red "no
   * longer available" alert on items that were perfectly fine — while
   * `PlaceOrder` went on to charge the current price. Shown one amount,
   * charged another, in bitcoin, with no refund mechanism.
   */
  it('queries every id it is given, however many', async () => {
    let received: string[] = [];
    const repo: Partial<ProductRepository> = {
      async findByIds(ids) {
        received = ids;
        return [];
      },
    };
    const many = Array.from({ length: 25 }, (_, i) => `id-${i}`);

    await new GetProductsByIds(repo as ProductRepository).execute({ productIds: many });

    expect(received).toHaveLength(25);
    expect(received).toEqual(many);
  });
});
