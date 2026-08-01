import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface GetProductsByIdsInput {
  productIds: string[];
}

/**
 * Customer-facing batch lookup, active products only. (`GetAnyProductsByIds`
 * is the admin counterpart, and has never had a limit.)
 *
 * Deliberately **unbounded**. This used to slice the list to 8 — a ceiling
 * that belonged to the recently-viewed widget, which enforces its own
 * `.max(8)` at its Zod boundary anyway, and which was silently imposed on
 * every other caller.
 *
 * The checkout summary passes every cart line through here, so past the eighth
 * item `findByIds` never saw the id: `repriceCartForDisplay` fell back to the
 * add-to-cart snapshot *and* flagged the line unavailable. The customer got a
 * stale price, a subtotal disagreeing with the one on `/cart`, and a "no
 * longer available" warning on items that were perfectly fine — while
 * `PlaceOrder` went on to charge the live price. Shown one amount, charged
 * another, irreversibly.
 *
 * A caller needing a ceiling imposes it where that ceiling is a property of
 * the feature, not here, where it quietly changes what a page knows about its
 * own data.
 */
export class GetProductsByIds implements UseCase<GetProductsByIdsInput, Product[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: GetProductsByIdsInput): Promise<Product[]> {
    if (input.productIds.length === 0) return [];
    return this.products.findByIds(input.productIds);
  }
}
