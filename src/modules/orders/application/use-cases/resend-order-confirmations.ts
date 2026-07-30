import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import { Money } from '@/shared/domain/money';
import type { OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';
import type { SendOrderConfirmationEmailInput } from '@/modules/notifications/application/use-cases/send-order-confirmation-email';

export interface ResendOrderConfirmationsInput {
  email: string;
}

/** Minimal shape actually needed from `SendOrderConfirmationEmail` — the
 * real use case satisfies this structurally, tests can supply a fake. */
export interface OrderConfirmationEmailSender {
  execute(input: SendOrderConfirmationEmailInput): Promise<void>;
}

/**
 * "Find my order" — a guest who lost their order link enters their email;
 * this resends the original order-confirmation email (with the order URL)
 * for every order under that address. Deliberately silent about whether
 * the email matched anything (same "don't reveal" convention as password
 * reset) — the caller always reports the same generic message regardless.
 */
export class ResendOrderConfirmations implements UseCase<ResendOrderConfirmationsInput, void> {
  constructor(
    private readonly orders: OrderHistoryRepository,
    private readonly sendOrderConfirmationEmail: OrderConfirmationEmailSender,
    private readonly appUrl: string,
  ) {}

  async execute(input: ResendOrderConfirmationsInput): Promise<void> {
    const orderIds = await this.orders.findOrderIdsByEmail(input.email);

    for (const orderId of orderIds) {
      try {
        const order = await this.orders.findById(orderId);
        if (!order) continue;

        await this.sendOrderConfirmationEmail.execute({
          customerEmail: input.email,
          orderId: order.id,
          lines: order.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
          // `toDisplayString`, not `toString` — this reaches a customer, and
          // `toString` is the debug form ("4200 USD"). The queued
          // order-confirmation path already formats it this way, and the same
          // order must not read differently depending on which path mailed it.
          totalDisplay: Money.of(order.amountMinor, order.currency).toDisplayString(),
          orderUrl: `${this.appUrl}/orders/${order.id}`,
        });
      } catch (e) {
        logger.error('resend-order-confirmations failed for order', {
          orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
