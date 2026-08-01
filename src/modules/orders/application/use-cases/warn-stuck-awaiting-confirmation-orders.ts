import { logger } from '@/shared/infrastructure/logger';
import type { UseCase } from '@/shared/application/use-case';
import type { ProcessedEventStore } from '@/modules/orders/application/use-cases/confirm-payment';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';
import type { StuckAwaitingConfirmationOrderRepository } from './fail-stuck-awaiting-confirmation-orders';

/**
 * Tells a part-paying customer their top-up window is about to close.
 *
 * `AWAITING_CONFIRMATION_WINDOW_HOURS` is the sharpest clock in the system:
 * when it runs out `FailStuckAwaitingConfirmationOrders` moves the order to
 * `failed`, which is terminal, and with no refund mechanism whatever the
 * customer already sent is gone. Nothing used to tell them it was coming — the
 * balance email said the amount owed "won't move while you finish paying" and
 * named no limit at all, which reads as unlimited time.
 *
 * It re-sends the balance email rather than introducing a second template.
 * That email now carries the deadline, so restating it near the end is exactly
 * the right content: the same address, the same amount, and the date it stops
 * being possible. A customer who has lost the first one gets another copy at
 * the moment it matters most.
 *
 * Runs on the same worker tick as the fail pass, so the once-only guard is
 * load-bearing: without it this would mail every affected customer every 45
 * seconds for hours. Marked seen **after** the mail is away, so a provider
 * blip costs a cycle rather than the only warning they get.
 */
export class WarnStuckAwaitingConfirmationOrders implements UseCase<void, void> {
  constructor(
    private readonly orders: StuckAwaitingConfirmationOrderRepository,
    private readonly processedEvents: ProcessedEventStore,
    private readonly notifier: UnderpaymentNotifier,
    /** `AWAITING_CONFIRMATION_WINDOW_HOURS` — when the order is failed. */
    private readonly windowHours: number,
    /** How long before that to warn. */
    private readonly warnHoursBefore: number,
  ) {}

  async execute(): Promise<void> {
    const warnAfterHours = this.windowHours - this.warnHoursBefore;
    // A warning point at or before the start of the window would mail every
    // customer the instant their payment was seen, which is not a warning —
    // it's the balance email again, immediately. Treated as a misconfiguration
    // and skipped rather than acted on.
    if (warnAfterHours <= 0) {
      logger.warn('warn-stuck-awaiting-confirmation: warning point is not inside the window', {
        windowHours: this.windowHours,
        warnHoursBefore: this.warnHoursBefore,
      });
      return;
    }

    const cutoff = new Date(Date.now() - warnAfterHours * 3_600_000);
    const orderIds = await this.orders.findStuckAwaitingConfirmationOrderIds(cutoff);

    for (const orderId of orderIds) {
      // Not a BullMQ job id, so a colon is fine — this is a Redis key of our
      // own making, matching the `evt:seen:` convention it lands in. Its
      // entries outlive the 48-hour window comfortably.
      const eventId = `topup-deadline-warned:${orderId}`;
      try {
        if (await this.processedEvents.seen(eventId)) continue;
        // A no-op for an order that is merely shallow rather than short — the
        // notifier itself declines to mail when nothing is outstanding, so a
        // customer who has paid in full and is waiting for blocks is never
        // told their money is at risk.
        await this.notifier.notifyUnderpaid(orderId);
        await this.processedEvents.markSeen(eventId);
      } catch (e) {
        logger.error('warn-stuck-awaiting-confirmation failed for order', {
          orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
