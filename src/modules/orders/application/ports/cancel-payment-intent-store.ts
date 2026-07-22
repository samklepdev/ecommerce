/** Narrow slice of `BitcoinPaymentStore` — mirrors how
 * `ConfirmPaymentOrderRepository` only exposes what `ConfirmPayment` needs
 * rather than the full order repository. */
export interface CancelPaymentIntentStore {
  markCancelled(orderId: string): Promise<void>;
}
