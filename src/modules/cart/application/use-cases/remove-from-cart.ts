import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Cart, type CartOwner } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

export interface RemoveFromCartInput {
  owner: CartOwner;
  variantId: string;
}

export class RemoveFromCart implements UseCase<RemoveFromCartInput, Cart> {
  constructor(private readonly carts: CartRepository) {}

  async execute(input: RemoveFromCartInput): Promise<Cart> {
    const existing = await this.carts.get(input.owner);
    const cart = existing ?? Cart.create({ id: randomUUID(), owner: input.owner, lines: [] });
    const updated = cart.removeLine(input.variantId);
    await this.carts.save(updated);
    return updated;
  }
}
