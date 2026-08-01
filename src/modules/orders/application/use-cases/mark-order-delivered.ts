import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { assertFulfillmentTransition, IllegalStatusTransitionError } from '@/modules/orders/domain/order-status';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';

export interface MarkOrderDeliveredInput {
  orderId: string;
}

export type MarkOrderDeliveredError = { code: 'not_found' } | { code: 'illegal_transition' }
  /**
   * The order's fulfillment status changed between reading it and writing —
   * another admin, or the shipment path. Nothing was written; reload and
   * decide again against what the order actually says now.
   */
  | { code: 'changed_underneath' };

/** Manual admin action — there's no carrier webhook or other automatic
 * delivery signal, so an admin (or, in future, a customer) records it once
 * the shipment has actually arrived. Same shape as `CancelOrderFulfillment`. */
export class MarkOrderDelivered
  implements UseCase<MarkOrderDeliveredInput, Result<void, MarkOrderDeliveredError>>
{
  constructor(private readonly orders: OrderFulfillmentRepository) {}

  async execute(input: MarkOrderDeliveredInput): Promise<Result<void, MarkOrderDeliveredError>> {
    const [paymentStatus, fulfillmentStatus] = await Promise.all([
      this.orders.getPaymentStatus(input.orderId),
      this.orders.getFulfillmentStatus(input.orderId),
    ]);
    if (paymentStatus === null || fulfillmentStatus === null) return err({ code: 'not_found' });

    try {
      assertFulfillmentTransition(paymentStatus, fulfillmentStatus, 'delivered');
    } catch (e) {
      if (e instanceof IllegalStatusTransitionError) return err({ code: 'illegal_transition' });
      throw e;
    }

    const applied = await this.orders.setFulfillmentStatus(
      input.orderId,
      'delivered',
      fulfillmentStatus,
    );
    if (!applied) return err({ code: 'changed_underneath' });
    return ok(undefined);
  }
}
