import type { UseCase } from '@/shared/application/use-case';
import type { ProcessedEventStore } from '@/modules/orders/application/use-cases/confirm-payment';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';

export interface NotifyUnderpaidOnceInput {
  orderId: string;
  /**
   * What has arrived so far, counting value still in the mempool. Part of the
   * de-dupe key, so a customer who pays *some* of the balance is told the new
   * figure — see below.
   *
   * Unconfirmed value is included deliberately: this decides what a customer
   * is asked to send, and asking again for sats already on their way is how
   * an accidental overpayment happens. If a pending transaction is dropped,
   * the figure changes and the next pass re-notifies.
   */
  seenSats: number;
}

/**
 * How coarsely the observed amount is bucketed for the de-dupe key.
 *
 * The key embedded the exact `seenSats`, which counts unconfirmed value — a
 * figure anyone can move, repeatedly, by sending dust to an address that is
 * public the moment the customer pays, or by chaining RBF replacements that
 * differ by a satoshi and never confirm. Each distinct figure minted a new
 * event id, so each watcher pass sent another "your payment was short" email:
 * one every 45 seconds, from the shop's authenticated sending domain, to an
 * address chosen by whoever placed the order.
 *
 * 10,000 sats is well above the 1,000-sat dust tolerance the watcher already
 * ignores, so noise cannot cross a boundary, while a genuine part-payment
 * moves several buckets at once and still re-notifies.
 */
const NOTIFY_BUCKET_SATS = 10_000;

function notifyBucket(seenSats: number): number {
  return Math.floor(seenSats / NOTIFY_BUCKET_SATS);
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
    const eventId = `underpaid-notified:${input.orderId}:${notifyBucket(input.seenSats)}`;
    if (await this.processedEvents.seen(eventId)) return;

    await this.notifier.notifyUnderpaid(input.orderId);
    await this.processedEvents.markSeen(eventId);
  }
}
