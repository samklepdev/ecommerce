import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import { Cart, type CartOwner } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { AnalyticsEventRepository } from '@/modules/analytics/application/ports/analytics-event-repository';

export interface UpdateCartLineQuantityInput {
  owner: CartOwner;
  variantId: string;
  quantity: number;
}

/** Sets a cart line to an exact quantity (not additive, unlike `AddToCart`)
 * — the cart page's quantity stepper. Zero or negative removes the line,
 * per `Cart.setLineQuantity`. */
export class UpdateCartLineQuantity implements UseCase<UpdateCartLineQuantityInput, Cart> {
  constructor(
    private readonly carts: CartRepository,
    private readonly events?: AnalyticsEventRepository,
  ) {}

  async execute(input: UpdateCartLineQuantityInput): Promise<Cart> {
    const existing = await this.carts.get(input.owner);
    const cart = existing ?? Cart.create({ id: randomUUID(), owner: input.owner, lines: [] });
    const updated = cart.setLineQuantity(input.variantId, input.quantity);
    await this.carts.save(updated);

    if (this.events) {
      // Best-effort — a tracking failure must never block a quantity update.
      try {
        await this.events.record({
          eventType: 'cart_changed',
          sessionId: input.owner.type === 'guest' ? input.owner.sessionId : input.owner.userId,
          userId: input.owner.type === 'user' ? input.owner.userId : null,
          metadata: { variantId: input.variantId, quantity: input.quantity, lineCount: updated.lines.length },
        });
      } catch (e) {
        logger.warn('failed to record cart_changed analytics event', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return updated;
  }
}
