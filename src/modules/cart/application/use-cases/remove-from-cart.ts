import type { UseCase } from '@/shared/application/use-case';
import type { Cart, CartOwner } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

export interface RemoveFromCartInput {
  owner: CartOwner;
  productId: string;
}

export class RemoveFromCart implements UseCase<RemoveFromCartInput, Cart> {
  constructor(private readonly carts: CartRepository) {}

  async execute(input: RemoveFromCartInput): Promise<Cart> {
    const updated = await this.carts.mutate(input.owner, (cart) =>
      cart.removeLine(input.productId),
    );
    return updated;
  }
}
