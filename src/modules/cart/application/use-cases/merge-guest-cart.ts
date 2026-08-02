import type { UseCase } from '@/shared/application/use-case';
import type { Cart } from '@/modules/cart/domain/cart';
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

    /**
     * Claim the guest cart **before** merging it, and only merge if this call
     * is the one that removed it.
     *
     * Reversed — merge then delete — a failure between the two left the guest
     * cart in place while its lines were already in the user's. `login` sets
     * the session cookie before awaiting this, so the customer is signed in
     * and simply retries: the same guest cart merges a second time, and
     * `mergeWith` sums quantities on collision, so they end up paying for
     * double the goods. `delete` reporting whether it removed anything is the
     * same mutex `PlaceOrder` uses against a double-submit.
     *
     * The cost is that a failure in the merge below loses the guest cart. That
     * is the better trade: re-adding items is an annoyance, silently doubling
     * an order is money.
     */
    const claimed = await this.carts.delete(guestOwner);
    if (!claimed) return this.carts.get(userOwner);

    // Atomic against a concurrent add to the user's own cart — the merge is a
    // read-transform-write like any other.
    return this.carts.mutate(userOwner, (userCart) => userCart.mergeWith(guestCart));
  }
}
