import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import { assertPaymentTransition } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentConfirmationNotifier } from '@/modules/orders/application/ports/payment-confirmation-notifier';

export interface ProcessedEventStore {
  seen(eventId: string): Promise<boolean>;
  markSeen(eventId: string): Promise<void>;
}

export interface FulfillmentQueue {
  enqueueOrderPaid(orderId: string): Promise<void>;
}

export interface ConfirmPaymentInput {
  orderId: string;
  eventId: string;
}

/*
 * No `confirmedSats` here, deliberately. It used to be accepted and never read,
 * which made it look as though this recorded the amount when nothing did. The
 * watcher persists it via `recordProgress` before reaching this point, on every
 * pass and in every branch, so adding a second writer would only create a way
 * for the two to disagree.
 */

/**
 * The ONLY place an order moves to `paid`, driven by the chain-watcher.
 * De-dupes by event id (watcher passes are re-run) and by the order's current
 * status — re-entrant paid->paid is a guarded no-op, never a re-application.
 */
export class ConfirmPayment implements UseCase<ConfirmPaymentInput, void> {
  constructor(
    private readonly orders: ConfirmPaymentOrderRepository,
    private readonly processedEvents: ProcessedEventStore,
    private readonly fulfillment: FulfillmentQueue,
    private readonly paymentConfirmationNotifier: PaymentConfirmationNotifier,
  ) {}

  async execute(input: ConfirmPaymentInput): Promise<void> {
    if (await this.processedEvents.seen(input.eventId)) return;

    const status = await this.orders.getPaymentStatus(input.orderId);
    if (status === null) return;

    /**
     * Already `paid` but the event was never marked seen, which can only mean
     * a previous attempt committed the status and then died before finishing.
     * That used to return here, and the side effects below were lost for good:
     * the watcher stops re-polling once `markConfirmed` runs, and it never got
     * that far either, so the *only* signal left was this unseen event id.
     *
     * So this is no longer an early return. Everything past this point is
     * idempotent, and re-doing it costs far less than a paid order with
     * nothing ordered from a supplier.
     */
    const alreadyPaid = status === 'paid';

    if (!alreadyPaid) {
      assertPaymentTransition(status, 'paid');
    }
    if (status === 'expired') {
      // Rare recovery path — the order-expiry grace window is kept in sync
      // with the watcher's own polling window specifically to avoid this,
      // so it recovering here means that safety margin was insufficient.
      // Worth an admin's attention even though it self-heals correctly.
      logger.warn('confirm-payment: order recovered from expired to paid', {
        orderId: input.orderId,
        eventId: input.eventId,
      });
      await this.orders.recordPaymentRecovery(input.orderId, 'expired');
    }
    if (status === 'cancelled') {
      // A customer cancelled before paying, but the BTC address was already
      // derived and handed out — if payment shows up anyway, it must still
      // be recorded, not stranded. Worth an admin's attention.
      logger.warn('confirm-payment: order recovered from cancelled to paid', {
        orderId: input.orderId,
        eventId: input.eventId,
      });
      await this.orders.recordPaymentRecovery(input.orderId, 'cancelled');
    }
    if (!alreadyPaid) {
      const applied = await this.orders.setPaymentStatus(input.orderId, 'paid', status);
      if (!applied) {
        // Something moved the order between the read above and here. Bail
        // without marking the event seen, so the next watcher pass re-reads and
        // decides afresh rather than acting on a status that is now stale.
        logger.warn('confirm-payment: order changed under us, retrying next pass', {
          orderId: input.orderId,
          expectedFrom: status,
        });
        return;
      }
    }

    /**
     * Deliberately *not* wrapped in try/catch, and deliberately before
     * `markSeen`. This is the step whose failure used to be unrecoverable, so
     * it has to be the step that keeps the event unfinished — throwing here
     * leaves the id unseen, and the watcher's next pass comes back and
     * completes it. `CreateSupplierOrdersForPaidOrder` only ever sees lines no
     * supplier order covers, so arriving twice adds nothing.
     */
    await this.fulfillment.enqueueOrderPaid(input.orderId);

    try {
      await this.paymentConfirmationNotifier.notifyPaymentConfirmed(input.orderId);
    } catch (e) {
      // Still swallowed: the parcel matters more than the receipt. Unlike the
      // enqueue above, a lost confirmation email is visible to the customer on
      // the order page, and letting it block `markSeen` would trade a missing
      // email for a repeatedly retried one.
      logger.warn('confirm-payment: payment confirmation notification failed', {
        orderId: input.orderId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Last, and only now: this id means "every side effect above completed".
    await this.processedEvents.markSeen(input.eventId);
  }
}
