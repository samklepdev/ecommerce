import type { UseCase } from '@/shared/application/use-case';
import { err, ok, isErr, type Result } from '@/shared/domain/result';
import type { Money } from '@/shared/domain/money';
import type { PaymentGateway } from '@/modules/payments/application/ports/payment-gateway';

export interface RefreshPaymentQuoteInput {
  orderId: string;
}

export interface RefreshPaymentQuoteResult {
  expectedSats: number;
  expiresAt: Date;
}

export type RefreshPaymentQuoteError =
  | { code: 'order_not_found' }
  | { code: 'not_awaiting_payment' }
  | { code: 'window_closed' }
  | { code: 'quote_failed' };

/** What this needs from the order: enough to decide whether a new quote is
 * allowed, and what to quote. */
export interface QuotableOrderRepository {
  findQuotable(orderId: string): Promise<{
    paymentStatus: string;
    paymentDeadlineAt: Date | null;
    total: Money;
  } | null>;
  setPaymentWindow(orderId: string, expiresAt: Date): Promise<void>;
}

/**
 * Gives a customer whose rate lock lapsed a fresh price for the same order.
 *
 * The two clocks exist so neither has to compromise: the quote is short
 * because holding a fiat→BTC price is real exposure, and the order is long
 * because people wander off. When the short one runs out, this is the bridge
 * back — same order, same address, today's rate.
 *
 * The address deliberately doesn't change (see `PaymentGateway.repricePayment`):
 * a customer may have already scanned the old QR, and a new address would
 * orphan anything they send to the old one.
 */
export class RefreshPaymentQuote
  implements UseCase<RefreshPaymentQuoteInput, Result<RefreshPaymentQuoteResult, RefreshPaymentQuoteError>>
{
  constructor(
    private readonly orders: QuotableOrderRepository,
    private readonly payments: PaymentGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: RefreshPaymentQuoteInput,
  ): Promise<Result<RefreshPaymentQuoteResult, RefreshPaymentQuoteError>> {
    const order = await this.orders.findQuotable(input.orderId);
    if (!order) return err({ code: 'order_not_found' });

    // Past awaiting_payment the chain has seen money; re-quoting then would
    // move the goalposts under a payment already in flight.
    if (order.paymentStatus !== 'awaiting_payment' && order.paymentStatus !== 'pending') {
      return err({ code: 'not_awaiting_payment' });
    }

    if (order.paymentDeadlineAt && order.paymentDeadlineAt.getTime() <= this.now().getTime()) {
      return err({ code: 'window_closed' });
    }

    const repriced = await this.payments.repricePayment({
      orderId: input.orderId,
      amount: order.total,
    });
    if (isErr(repriced)) return err({ code: 'quote_failed' });
    if (repriced.value.expiresAt === null || repriced.value.expectedSats === null) {
      // No intent to re-quote — the order never reached checkout.
      return err({ code: 'quote_failed' });
    }

    // The order's own copy of the window has to move with the intent's, or
    // the customer sees a countdown that disagrees with the amount.
    await this.orders.setPaymentWindow(input.orderId, repriced.value.expiresAt);

    return ok({ expectedSats: repriced.value.expectedSats, expiresAt: repriced.value.expiresAt });
  }
}
