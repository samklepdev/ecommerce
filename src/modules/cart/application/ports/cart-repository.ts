import type { Cart, CartOwner } from '@/modules/cart/domain/cart';

export interface CartRepository {
  get(owner: CartOwner): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
  /**
   * Read, transform, write — atomically with respect to other mutations of the
   * same cart.
   *
   * Every cart change used to be `get()` then `save()` from the use case, with
   * the whole document rewritten. Two requests that overlapped — two quick-add
   * clicks, or a login-merge racing an in-flight add — both read the same cart
   * and both wrote their own version, so the second silently erased the first.
   * The customer simply doesn't see an item they added.
   *
   * `transform` must be **pure and repeatable**: it may be called more than
   * once, because a conflicting write causes the whole read-transform-write to
   * be retried against fresh state. It receives the current cart, or an empty
   * one when there is none, which is what every caller wanted anyway.
   */
  mutate(owner: CartOwner, transform: (cart: Cart) => Cart): Promise<Cart>;
  /**
   * Removes the cart and reports whether **this call** is the one that removed
   * it. Two concurrent callers can therefore agree on a winner without a lock:
   * `PlaceOrder` uses it as the mutex that stops one cart becoming two orders.
   */
  delete(owner: CartOwner): Promise<boolean>;
}
