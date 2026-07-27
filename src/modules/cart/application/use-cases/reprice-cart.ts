import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import type { CartOwner } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface RepriceCartInput {
  owner: CartOwner;
  currency: string;
}

export interface RepriceCartOutput {
  subtotal: Money;
  /** Product ids whose catalog price has drifted from what's stored in the cart. */
  staleProductIds: string[];
}

/**
 * Display-only convenience — recomputes totals against current catalog prices
 * so the cart page never shows a stale total. Checkout re-prices independently
 * and is the actual pricing authority.
 */
export class RepriceCart implements UseCase<RepriceCartInput, RepriceCartOutput> {
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(input: RepriceCartInput): Promise<RepriceCartOutput> {
    const cart = await this.carts.get(input.owner);
    if (!cart) return { subtotal: Money.zero(input.currency), staleProductIds: [] };

    let subtotal = Money.zero(input.currency);
    const staleProductIds: string[] = [];

    for (const line of cart.lines) {
      const product = await this.products.findById(line.productId);
      if (!product) continue;
      if (!product.price.equals(line.unitPrice)) staleProductIds.push(line.productId);
      subtotal = subtotal.add(product.price.multiply(line.quantity));
    }

    return { subtotal, staleProductIds };
  }
}
