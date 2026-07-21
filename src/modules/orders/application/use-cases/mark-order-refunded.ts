import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { assertPaymentTransition, IllegalStatusTransitionError } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';

export interface MarkOrderRefundedInput {
  orderId: string;
}

export type MarkOrderRefundedError = { code: 'not_found' } | { code: 'illegal_transition' };

/** Records that an order was refunded — the actual refund is a manual,
 * out-of-band on-chain send (crypto is irreversible); this just updates
 * the durable record after an admin has already sent it. Returns a
 * `Result` rather than throwing: this fires from an interactive admin
 * action, not a background watcher, so a friendly error belongs in the
 * response. */
export class MarkOrderRefunded implements UseCase<MarkOrderRefundedInput, Result<void, MarkOrderRefundedError>> {
  constructor(private readonly orders: ConfirmPaymentOrderRepository) {}

  async execute(input: MarkOrderRefundedInput): Promise<Result<void, MarkOrderRefundedError>> {
    const status = await this.orders.getPaymentStatus(input.orderId);
    if (status === null) return err({ code: 'not_found' });

    try {
      assertPaymentTransition(status, 'refunded');
    } catch (e) {
      if (e instanceof IllegalStatusTransitionError) return err({ code: 'illegal_transition' });
      throw e;
    }

    await this.orders.setPaymentStatus(input.orderId, 'refunded');
    return ok(undefined);
  }
}
