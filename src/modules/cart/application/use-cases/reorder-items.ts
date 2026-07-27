import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { Cart, type CartOwner } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';

export interface ReorderItemsInput {
  owner: CartOwner;
  orderId: string;
  /** null for the guest/id-only path — same dual-path shape as CancelOrder. */
  ownerUserId: string | null;
}

export interface ReorderItemsResult {
  addedCount: number;
  unavailableSkus: string[];
}

export type ReorderItemsError = { code: 'order_not_found' };

/** Re-adds a past order's lines to the current cart, re-priced from the
 * live catalog — mirrors AddToCart's re-pricing (never trust the order's
 * stored price) applied per line, and MergeGuestCart's load-loop-save
 * shape. Lines whose product no longer exists are skipped and reported,
 * not treated as a failure of the whole operation. */
export class ReorderItems implements UseCase<ReorderItemsInput, Result<ReorderItemsResult, ReorderItemsError>> {
  constructor(
    private readonly orders: OrderHistoryRepository,
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(input: ReorderItemsInput): Promise<Result<ReorderItemsResult, ReorderItemsError>> {
    const order = input.ownerUserId
      ? await this.orders.findDetailById(input.orderId, input.ownerUserId)
      : await this.orders.findById(input.orderId);
    if (!order) return err({ code: 'order_not_found' });

    let cart = (await this.carts.get(input.owner)) ?? Cart.create({ id: randomUUID(), owner: input.owner, lines: [] });

    const unavailableSkus: string[] = [];
    let addedCount = 0;
    for (const line of order.lines) {
      const product = await this.products.findById(line.productId);
      if (!product) {
        unavailableSkus.push(line.sku);
        continue;
      }
      cart = cart.addLine(
        CartLine.create({
          productId: product.id,
          sku: product.sku,
          quantity: line.quantity,
          unitPrice: product.price,
        }),
      );
      addedCount++;
    }

    await this.carts.save(cart);
    return ok({ addedCount, unavailableSkus });
  }
}
