import { logger } from '@/shared/infrastructure/logger';
import type { UseCase } from '@/shared/application/use-case';

export interface StaleCheckoutOrderRepository {
  findExpiredAwaitingOrderIds(now: Date): Promise<string[]>;
  /** Guarded, idempotent: returns false if another pass already expired this order. */
  tryExpire(orderId: string): Promise<boolean>;
}

/** The payment-intent side of expiry. Narrowed to the one method this use
 * case needs rather than taking the whole `BitcoinPaymentStore`. */
export interface ExpiringPaymentIntentStore {
  markExpired(orderId: string): Promise<void>;
}

/**
 * Runs alongside the chain-watcher (same worker tick, no separate poller).
 * Expires the order once its BTC quote/payment-window TTL has passed with
 * nothing confirmed on-chain, and expires its payment intent with it — the
 * two are separate records, and leaving the intent `awaiting` both
 * misreports the table and would hand a stale rate-lock back to a retried
 * checkout. No inventory to release — items are sourced from suppliers only
 * after payment confirms.
 */
export class ExpireStaleCheckouts implements UseCase<void, void> {
  constructor(
    private readonly orders: StaleCheckoutOrderRepository,
    private readonly intents: ExpiringPaymentIntentStore,
  ) {}

  async execute(): Promise<void> {
    const orderIds = await this.orders.findExpiredAwaitingOrderIds(new Date());

    for (const orderId of orderIds) {
      try {
        await this.orders.tryExpire(orderId);
      } catch (e) {
        logger.error('expire-stale-checkouts failed for order', {
          orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Separate try: the order is the record that matters, and its status
      // is already committed above. A failure updating the intent's
      // bookkeeping must not stop the loop or undo that.
      try {
        await this.intents.markExpired(orderId);
      } catch (e) {
        logger.error('expire-stale-checkouts failed to expire payment intent', {
          orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
