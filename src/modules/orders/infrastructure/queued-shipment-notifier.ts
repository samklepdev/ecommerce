import type { ShipmentNotifier } from '@/modules/orders/application/ports/shipment-notifier';
import type { JobQueue } from '@/shared/application/ports/job-queue';
import { logger } from '@/shared/infrastructure/logger';

/**
 * The "your order has shipped" email, queued rather than sent inline.
 *
 * Every other order email already went through the queue; this one didn't. It
 * was called straight from the admin action and swallowed each failure into a
 * log line, so a mail-provider blip lost the tracking number for good — with
 * nothing to retry it and no entry in the failed set to find it in. It is also
 * the one message `PaymentConfirmedEmail` explicitly promises the customer.
 *
 * **No job id, deliberately.** A stable one would be deduplicated against the
 * earlier job, and an order legitimately ships more than once: a second parcel
 * from another supplier, or an admin correcting a tracking number. Each of
 * those is a message the customer should get, and each rebuilds the full list
 * of parcels — so a repeat is a corrected email, not a duplicate one.
 *
 * Still swallows a failed *enqueue*, per the port's contract: the parcel is
 * already moving, and a queue outage must not undo the record of it.
 */
export class QueuedShipmentNotifier implements ShipmentNotifier {
  constructor(private readonly jobs: JobQueue) {}

  async notifyShipped(orderId: string): Promise<void> {
    try {
      await this.jobs.enqueue('email.shipment', { orderId });
    } catch (e) {
      logger.error('could not queue the shipment email', {
        orderId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
