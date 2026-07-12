import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Cart } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

export interface MergeGuestCartInput {
  guestSessionId: string;
  userId: string;
}

/** On login: union the guest cart into the user's cart, qty-summed on collision. */
export class MergeGuestCart implements UseCase<MergeGuestCartInput, Cart | null> {
  constructor(private readonly carts: CartRepository) {}

  async execute(input: MergeGuestCartInput): Promise<Cart | null> {
    const guestOwner = { type: 'guest' as const, sessionId: input.guestSessionId };
    const userOwner = { type: 'user' as const, userId: input.userId };

    const guestCart = await this.carts.get(guestOwner);
    if (!guestCart || guestCart.isEmpty) return this.carts.get(userOwner);

    const userCart =
      (await this.carts.get(userOwner)) ??
      Cart.create({ id: randomUUID(), owner: userOwner, lines: [] });

    const merged = userCart.mergeWith(guestCart);
    await this.carts.save(merged);
    await this.carts.delete(guestOwner);
    return merged;
  }
}
