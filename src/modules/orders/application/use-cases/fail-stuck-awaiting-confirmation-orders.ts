import { logger } from '@/shared/infrastructure/logger';
import type { UseCase } from '@/shared/application/use-case';

export interface StuckAwaitingConfirmationOrderRepository {
  findStuckAwaitingConfirmationOrderIds(cutoff: Date): Promise<string[]>;
  /** Guarded, idempotent: returns false if another pass already resolved this order. */
  tryFailStuckAwaitingConfirmation(orderId: string): Promise<boolean>;
}

/**
 * Runs alongside the chain-watcher (same worker tick as ExpireStaleCheckouts).
 * An order that reached awaiting_confirmation (payment seen on-chain, but
 * underpaid or too shallow) and never resolved to `paid` within
 * `AWAITING_CONFIRMATION_WINDOW_HOURS` is moved to `failed` — distinct from
 * `expired`, which means nothing was ever seen on-chain at all. An admin can
 * also resolve one manually before the timeout via FailOrder.
 *
 * For an underpaid order this window is the customer's chance to top up, so
 * running out of it means they have paid and received nothing.
 */
export class FailStuckAwaitingConfirmationOrders implements UseCase<void, void> {
  constructor(
    private readonly orders: StuckAwaitingConfirmationOrderRepository,
    /** `AWAITING_CONFIRMATION_WINDOW_HOURS`. Injected rather than a constant
     * because it decides when a part-paying customer loses their money, and a
     * number like that should be visible and tunable next to the other money
     * clocks — not buried in the file that happens to enforce it. */
    private readonly windowHours: number,
  ) {}

  async execute(): Promise<void> {
    const cutoff = new Date(Date.now() - this.windowHours * 60 * 60 * 1000);
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
