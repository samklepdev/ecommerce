import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { assertPaymentTransition, IllegalStatusTransitionError } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';

export interface FailOrderInput {
  orderId: string;
}

export type FailOrderError = { code: 'not_found' } | { code: 'illegal_transition' };

/** Manual admin override for an order stuck in awaiting_confirmation (seen
 * on-chain, underpaid or too shallow, never resolving) — an admin can move
 * it to `failed` before FailStuckAwaitingConfirmationOrders' 48h timeout
 * would do so automatically, e.g. when a customer emails asking to give up. */
export class FailOrder implements UseCase<FailOrderInput, Result<void, FailOrderError>> {
  constructor(private readonly orders: ConfirmPaymentOrderRepository) {}

  async execute(input: FailOrderInput): Promise<Result<void, FailOrderError>> {
    const status = await this.orders.getPaymentStatus(input.orderId);
    if (status === null) return err({ code: 'not_found' });

    try {
      assertPaymentTransition(status, 'failed');
    } catch (e) {
      if (e instanceof IllegalStatusTransitionError) return err({ code: 'illegal_transition' });
      throw e;
    }

    await this.orders.setPaymentStatus(input.orderId, 'failed');
    return ok(undefined);
  }
}
