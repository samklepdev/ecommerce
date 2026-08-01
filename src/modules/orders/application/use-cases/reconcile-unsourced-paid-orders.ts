import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { FulfillmentQueue } from '@/modules/orders/application/use-cases/confirm-payment';

export interface UnsourcedPaidOrderRepository {
  /**
   * Paid orders holding at least one line that **no supplier order covers and
   * that carries no fulfillment issue**.
   *
   * Both halves matter. No supplier order line means it was never bought. No
   * fulfillment issue means sourcing was never even *attempted* — because
   * `CreateSupplierOrdersForPaidOrder` flags every line it tries and fails to
   * source. A flagged line is a known problem already sitting in
   * `/admin/fulfillment`; re-queueing it every pass would achieve nothing but
   * noise. An unflagged one is work that silently went missing.
   *
   * `idleSince` filters on `orders.updatedAt`, which `setPaymentStatus` bumps —
   * so this reads as "marked paid a while ago and nothing has touched it
   * since".
   */
  findPaidOrderIdsWithUnattemptedLines(idleSince: Date): Promise<string[]>;
}

/**
 * How long to leave an order alone before treating outstanding sourcing as
 * lost. The job retries five times with exponential backoff from two seconds,
 * so it resolves within about a minute in normal operation; fifteen is
 * comfortably past that without leaving a real customer waiting long.
 */
const IDLE_AFTER_MS = 15 * 60 * 1000;

/**
 * Catches paid orders whose sourcing job went missing.
 *
 * `ConfirmPayment` no longer loses the enqueue itself — an unseen event id
 * keeps the watcher coming back until it succeeds. But that only covers the
 * enqueue *failing*. If the enqueue succeeded and the job was later lost —
 * Redis wiped, or a queue drained by hand — nothing was left to notice: the
 * event is marked seen, the order is `paid`, and its lines carry no
 * fulfillment issue, so they don't appear in the admin's unsourced queue
 * either. That order would sit paid and unfulfilled indefinitely, invisible.
 *
 * This is the reconciler for that. It re-enqueues rather than sourcing
 * directly, so all the ordering logic stays in one place and the handler's
 * own idempotency still applies.
 *
 * Runs every watcher pass, like `ExpireStaleCheckouts` and
 * `FailStuckAwaitingConfirmationOrders` — it's one indexed query and the
 * result set should always be empty. Deliberately **not** bounded to recent
 * orders: an order stranded before this existed is exactly the case worth
 * catching, and the set being empty in normal operation means an unbounded
 * query costs nothing. A warning that repeats every pass for the same order id
 * therefore means that order is genuinely stuck and wants a human, not that
 * the reconciler is misfiring.
 */
export class ReconcileUnsourcedPaidOrders implements UseCase<void, void> {
  constructor(
    private readonly orders: UnsourcedPaidOrderRepository,
    private readonly fulfillment: FulfillmentQueue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<void> {
    const idleSince = new Date(this.now().getTime() - IDLE_AFTER_MS);
    const orderIds = await this.orders.findPaidOrderIdsWithUnattemptedLines(idleSince);

    for (const orderId of orderIds) {
      try {
        // `requeue`, not `enqueue`: a plain enqueue is deduplicated against the
        // failed job from the attempt that went missing, so it would queue
        // nothing for the two weeks BullMQ retains it — while logging below
        // that it had re-queued successfully.
        await this.fulfillment.requeueOrderPaid(orderId);
        // `warn`, matching ConfirmPayment's recovery paths: it self-heals from
        // here, but a lost job is worth knowing about because the next thing
        // the queue drops might not have a reconciler.
        logger.warn('reconcile: re-queued sourcing for a paid order with unattempted lines', {
          orderId,
        });
      } catch (e) {
        logger.error('reconcile: could not re-queue sourcing', {
          orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
