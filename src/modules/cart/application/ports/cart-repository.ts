import type { Cart, CartOwner } from '@/modules/cart/domain/cart';

export interface CartRepository {
  get(owner: CartOwner): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
  /**
   * Removes the cart and reports whether **this call** is the one that removed
   * it. Two concurrent callers can therefore agree on a winner without a lock:
   * `PlaceOrder` uses it as the mutex that stops one cart becoming two orders.
   */
  delete(owner: CartOwner): Promise<boolean>;
}
