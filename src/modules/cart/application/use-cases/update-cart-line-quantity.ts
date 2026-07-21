import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Cart, type CartOwner } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

export interface UpdateCartLineQuantityInput {
  owner: CartOwner;
  variantId: string;
  quantity: number;
}

/** Sets a cart line to an exact quantity (not additive, unlike `AddToCart`)
 * — the cart page's quantity stepper. Zero or negative removes the line,
 * per `Cart.setLineQuantity`. */
export class UpdateCartLineQuantity implements UseCase<UpdateCartLineQuantityInput, Cart> {
  constructor(private readonly carts: CartRepository) {}

  async execute(input: UpdateCartLineQuantityInput): Promise<Cart> {
    const existing = await this.carts.get(input.owner);
    const cart = existing ?? Cart.create({ id: randomUUID(), owner: input.owner, lines: [] });
    const updated = cart.setLineQuantity(input.variantId, input.quantity);
    await this.carts.save(updated);
    return updated;
  }
}
