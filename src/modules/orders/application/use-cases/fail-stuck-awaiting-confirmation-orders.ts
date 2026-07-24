import { logger } from '@/shared/infrastructure/logger';
import type { UseCase } from '@/shared/application/use-case';

export interface StuckAwaitingConfirmationOrderRepository {
  findStuckAwaitingConfirmationOrderIds(cutoff: Date): Promise<string[]>;
  /** Guarded, idempotent: returns false if another pass already resolved this order. */
  tryFailStuckAwaitingConfirmation(orderId: string): Promise<boolean>;
}

const STUCK_AFTER_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Runs alongside the chain-watcher (same worker tick as ExpireStaleCheckouts).
 * An order that reached awaiting_confirmation (payment seen on-chain, but
 * underpaid or too shallow) and never resolved to `paid` within 48h is moved
 * to `failed` — distinct from `expired`, which means nothing was ever seen
 * on-chain at all. An admin can also resolve one manually before the
 * timeout via FailOrder.
 */
export class FailStuckAwaitingConfirmationOrders implements UseCase<void, void> {
  constructor(private readonly orders: StuckAwaitingConfirmationOrderRepository) {}

  async execute(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
    const orderIds = await this.orders.findStuckAwaitingConfirmationOrderIds(cutoff);

    for (const orderId of orderIds) {
      try {
        await this.orders.tryFailStuckAwaitingConfirmation(orderId);
      } catch (e) {
        logger.error('fail-stuck-awaiting-confirmation-orders failed for order', {
          orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
