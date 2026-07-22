export interface CancelOrderRepository {
  /** Guarded, idempotent: a single UPDATE gated on the current status being
   * pending/awaiting_payment. `ownerUserId: null` skips the ownership
   * filter entirely — matches the guest order page's existing trust model
   * (order id alone is the access capability), it doesn't loosen it. Returns
   * false if the order doesn't exist, isn't cancellable, or isn't owned by
   * the given user. */
  cancelOrder(orderId: string, ownerUserId: string | null): Promise<boolean>;
}
