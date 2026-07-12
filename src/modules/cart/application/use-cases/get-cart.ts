import type { UseCase } from '@/shared/application/use-case';
import type { Cart, CartOwner } from '@/modules/cart/domain/cart';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

export interface GetCartInput {
  owner: CartOwner;
}

export class GetCart implements UseCase<GetCartInput, Cart | null> {
  constructor(private readonly carts: CartRepository) {}

  async execute(input: GetCartInput): Promise<Cart | null> {
    return this.carts.get(input.owner);
  }
}
