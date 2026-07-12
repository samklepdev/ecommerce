import type { Cart, CartOwner } from '@/modules/cart/domain/cart';

export interface CartRepository {
  get(owner: CartOwner): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
  delete(owner: CartOwner): Promise<void>;
}
