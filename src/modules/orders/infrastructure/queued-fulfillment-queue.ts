import type { FulfillmentQueue } from '@/modules/orders/application/use-cases/confirm-payment';
import { jobIdFor, type JobQueue } from '@/shared/application/ports/job-queue';

/**
 * "Order paid" → a job, instead of doing the sourcing work inline.
 *
 * The name was always aspirational: the previous implementation called
 * `CreateSupplierOrdersForPaidOrder` directly, on the watcher's thread,
 * inside the pass that had just confirmed the payment. A slow supplier
 * lookup delayed every other order's chain poll, and a failure was a log
 * line — the order was paid, nothing was ordered, and nothing would ever
 * try again without someone noticing.
 *
 * The job id is the order id, so the watcher re-running its pass over an
 * order that is already paid doesn't queue the work a second time.
 */
export class QueuedFulfillmentQueue implements FulfillmentQueue {
  constructor(private readonly jobs: JobQueue) {}

  async enqueueOrderPaid(orderId: string): Promise<void> {
    await this.jobs.enqueue(
      'fulfillment.create-supplier-orders',
      { orderId },
      { jobId: jobIdFor('fulfillment', orderId) },
    );
  }

  /**
   * Same job, but discarding any earlier attempt still on record.
   *
   * The stable id above dedupes against *any* existing job, including one that
   * exhausted its attempts and is sitting in the failed set — which BullMQ
   * keeps for two weeks. `ReconcileUnsourcedPaidOrders` exists to re-queue
   * sourcing that went missing, so for that entire window it queued nothing at
   * all and logged that it had succeeded: a paid order with nothing ordered,
   * invisible because its lines carry no fulfillment issue either.
   *
   * The id is kept rather than dropped, so two reconciler passes racing each
   * other still queue the work once.
   */
  async requeueOrderPaid(orderId: string): Promise<void> {
    await this.jobs.enqueue(
      'fulfillment.create-supplier-orders',
      { orderId },
      { jobId: jobIdFor('fulfillment', orderId), replaceExisting: true },
    );
  }
}
