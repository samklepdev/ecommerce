import type { UseCase } from '@/shared/application/use-case';
import type { ProcessedEventStore } from '@/modules/orders/application/use-cases/confirm-payment';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';

export interface NotifyUnderpaidOnceInput {
  orderId: string;
}

/**
 * Tells a part-paying customer what's still owed — exactly once.
 *
 * The watcher re-polls every 45 seconds and an underpaid order stays that way
 * until it's topped up or fails at 48 hours, so the naive call would mail
 * someone thousands of times. This owns the once-only part so the watcher
 * doesn't have to.
 *
 * De-duped through `ProcessedEventStore` rather than a new column. Its entries
 * live 7 days, which comfortably outlasts the 48-hour window an order can be
 * underpaid for, so the guard holds for the whole time it needs to. Losing
 * Redis costs one duplicate "you still owe" email, which is the cheapest
 * failure available here — a column would survive that, at the price of a
 * migration for a guard that never needs to outlive the order.
 *
 * Marked seen **after** the notification is away, so a failed enqueue costs a
 * cycle rather than the email.
 */
export class NotifyUnderpaidOnce implements UseCase<NotifyUnderpaidOnceInput, void> {
  constructor(
    private readonly processedEvents: ProcessedEventStore,
    private readonly notifier: UnderpaymentNotifier,
  ) {}

  async execute(input: NotifyUnderpaidOnceInput): Promise<void> {
    // Not a BullMQ job id, so a colon is fine here — this is a Redis key of
    // our own making, and it matches the `evt:seen:` convention it lands in.
    const eventId = `underpaid-notified:${input.orderId}`;
    if (await this.processedEvents.seen(eventId)) return;

    await this.notifier.notifyUnderpaid(input.orderId);
    await this.processedEvents.markSeen(eventId);
  }
}
