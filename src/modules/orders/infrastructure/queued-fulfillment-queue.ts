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
}
