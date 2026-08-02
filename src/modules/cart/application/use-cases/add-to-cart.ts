import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import type { Cart, CartOwner } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { AnalyticsEventRepository } from '@/modules/analytics/application/ports/analytics-event-repository';

export interface AddToCartInput {
  owner: CartOwner;
  productId: string;
  quantity: number;
}

export type AddToCartError = { code: 'product_not_found' };

export class AddToCart implements UseCase<AddToCartInput, Result<Cart, AddToCartError>> {
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
    private readonly events?: AnalyticsEventRepository,
  ) {}

  async execute(input: AddToCartInput): Promise<Result<Cart, AddToCartError>> {
    const product = await this.products.findById(input.productId);
    if (!product) return err({ code: 'product_not_found' });

    // One atomic read-transform-write. Read-then-save let two quick-add
    // clicks each read the same cart and each write their own version, so the
    // customer silently lost whichever landed first.
    const updated = await this.carts.mutate(input.owner, (cart) =>
      cart.addLine(
        CartLine.create({
          productId: product.id,
          productName: product.name,
          quantity: input.quantity,
          unitPrice: product.price,
        }),
      ),
    );

    if (this.events) {
      // Best-effort — a tracking failure must never block adding to cart.
      try {
        await this.events.record({
          eventType: 'cart_changed',
          sessionId: input.owner.type === 'guest' ? input.owner.sessionId : input.owner.userId,
          userId: input.owner.type === 'user' ? input.owner.userId : null,
          metadata: { lines: updated.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) },
        });
      } catch (e) {
        logger.warn('failed to record cart_changed analytics event', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return ok(updated);
  }
}
