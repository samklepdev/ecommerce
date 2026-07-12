import { logger } from '@/shared/infrastructure/logger';
import type { UseCase } from '@/shared/application/use-case';

export interface StaleCheckoutOrderRepository {
  findExpiredAwaitingOrderIds(now: Date): Promise<string[]>;
  /** Guarded, idempotent: returns false if another pass already expired this order. */
  tryExpire(orderId: string): Promise<boolean>;
}

/**
 * Runs alongside the chain-watcher (same worker tick, no separate poller).
 * Expires the order once its BTC quote/payment-window TTL has passed with
 * nothing confirmed on-chain. No inventory to release — items are sourced
 * from suppliers only after payment confirms.
 */
export class ExpireStaleCheckouts implements UseCase<void, void> {
  constructor(private readonly orders: StaleCheckoutOrderRepository) {}

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
    }
  }
}
