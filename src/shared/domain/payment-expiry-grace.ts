/** Shared between the BTC payment-intent watcher's continued-polling window
 * (`DrizzleBitcoinPaymentStore.listWatchable`) and the order-expiry sweep
 * (`DrizzleOrderRepository.findExpiredAwaitingOrderIds`) — the two must stay
 * in sync. If the order-expiry check used a shorter (or no) grace period,
 * an order could be marked `expired` (terminal) while the watcher is still
 * polling and later finds a genuinely confirmed payment for it. */
export const PAYMENT_EXPIRY_GRACE_MS = 15 * 60 * 1000;
