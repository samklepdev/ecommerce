import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import {
  assertFulfillmentTransition,
  IllegalStatusTransitionError,
} from '@/modules/orders/domain/order-status';
import { logger } from '@/shared/infrastructure/logger';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

export interface CancelOrderFulfillmentInput {
  orderId: string;
}

export type CancelOrderFulfillmentError = { code: 'not_found' } | { code: 'illegal_transition' }
  /**
   * The order's fulfillment status changed between reading it and writing —
   * another admin, or the shipment path. Nothing was written; reload and
   * decide again against what the order actually says now.
   */
  | { code: 'changed_underneath' };

/**
 * The admin's last resort: close out an order that can't be completed.
 *
 * Two situations reach here, and neither had any exit before it existed:
 *
 * - **Paid, but the goods can't be obtained.** Publishing refuses a product
 *   with no supplier offer, but an offer can be withdrawn afterwards, so the
 *   money path never assumes that check held. Such an order used to sit `paid` +
 *   `unfulfilled` permanently: `paid` has no onward payment transition, and the
 *   only code that set fulfillment `cancelled` required *all* supplier orders
 *   cancelled — of which there were none, and `allCancelledForOrder` returns
 *   false for an empty set. Nothing in the UI could touch it.
 * - **A parcel lost in transit.** `shipped` previously led only to `delivered`,
 *   and recording a lost parcel as delivered puts a lie in the durable record.
 *
 * **This does not touch payment status.** If the customer paid, they paid —
 * that's a fact about the chain, and rewriting it to `failed` would corrupt
 * revenue reporting and lose the evidence that money is owed to someone. What
 * this records is that the shop is not going to fulfil the order. Making the
 * customer whole is a separate, out-of-band act.
 *
 * Already-cancelled is a success, not an error: two admins on the same page
 * both wanted this outcome, and it's what they got.
 */
export class CancelOrderFulfillment
  implements UseCase<CancelOrderFulfillmentInput, Result<void, CancelOrderFulfillmentError>>
{
  constructor(
    private readonly orders: OrderFulfillmentRepository,
    /**
     * Cancelled downward too. `listNeedingAction` filters purely on a supplier
     * order's own status with no join to its parent, so without this the
     * cancelled order's supplier orders stayed in `/admin/fulfillment` with a
     * working "Mark ordered" button and a shipping address, and nothing on the
     * card said the order was dead — so whoever worked the queue bought the
     * goods.
     */
    private readonly supplierOrders: SupplierOrderRepository,
  ) {}

  async execute(
    input: CancelOrderFulfillmentInput,
  ): Promise<Result<void, CancelOrderFulfillmentError>> {
    const [paymentStatus, fulfillmentStatus] = await Promise.all([
      this.orders.getPaymentStatus(input.orderId),
      this.orders.getFulfillmentStatus(input.orderId),
    ]);
    if (paymentStatus === null || fulfillmentStatus === null) return err({ code: 'not_found' });

    if (fulfillmentStatus === 'cancelled') return ok(undefined);

    try {
      assertFulfillmentTransition(paymentStatus, fulfillmentStatus, 'cancelled');
    } catch (e) {
      if (e instanceof IllegalStatusTransitionError) return err({ code: 'illegal_transition' });
      throw e;
    }

    // Guarded on the status read above: if the order moved on while we were
    // asserting, this cancellation is describing a state that no longer
    // exists and must not overwrite whatever replaced it.
    const applied = await this.orders.setFulfillmentStatus(
      input.orderId,
      'cancelled',
      fulfillmentStatus,
    );
    if (!applied) return err({ code: 'changed_underneath' });

    /**
     * After the order, not before: the order row is the decision, and a
     * failure cancelling a supplier order must not leave the order looking
     * live. The repository's own guard limits this to `needs_ordering` and
     * `ordered`, so a parcel already with a courier keeps its `shipped`
     * status — recording that as cancelled would be a different lie.
     *
     * Failures are logged rather than surfaced: the order is already closed,
     * and a stuck supplier order is visible in the fulfillment queue, which is
     * where someone would look anyway.
     */
    for (const supplierOrder of await this.supplierOrders.listByOrderId(input.orderId)) {
      try {
        await this.supplierOrders.cancel(supplierOrder.id);
      } catch (e) {
        logger.error('order cancelled, but a supplier order could not be', {
          orderId: input.orderId,
          supplierOrderId: supplierOrder.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return ok(undefined);
  }
}
