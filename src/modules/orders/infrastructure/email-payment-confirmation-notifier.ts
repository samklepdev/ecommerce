import type { PaymentConfirmationNotifier } from '@/modules/orders/application/ports/payment-confirmation-notifier';
import type { OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import { renderPaymentConfirmedEmailHtml } from '@/modules/notifications/application/order-email-templates';
import { Money } from '@/shared/domain/money';

/**
 * `ConfirmPayment` only has an order id (it's driven by the chain-watcher,
 * not a request), so this adapter looks the order up itself via the
 * unscoped `OrderHistoryRepository.findById` rather than requiring the
 * caller to pass order details through.
 */
export class EmailPaymentConfirmationNotifier implements PaymentConfirmationNotifier {
  constructor(
    private readonly orderHistory: OrderHistoryRepository,
    private readonly emailSender: EmailSender,
    private readonly appUrl: string,
    private readonly supportEmail: string,
  ) {}

  async notifyPaymentConfirmed(orderId: string): Promise<void> {
    const order = await this.orderHistory.findById(orderId);
    if (!order) return;

    // `amountMinor` is the total PlaceOrder persisted — line items plus
    // shipping, less any coupon — and it's what the BTC quote was struck
    // from. Re-summing the lines here (as this did) silently dropped both
    // adjustments, so the email disagreed with the order page and with the
    // amount the customer actually sent.
    const total = Money.of(order.amountMinor, order.currency);

    const html = renderPaymentConfirmedEmailHtml({
      orderId: order.id,
      // Customer-facing, so the formatted form — `toString` is the debug
      // shape ("4200 USD"). See the same note in ResendOrderConfirmations.
      totalDisplay: total.toDisplayString(),
      orderUrl: `${this.appUrl}/orders/${order.id}`,
      supportEmail: this.supportEmail,
    });

    await this.emailSender.send(order.customerEmail, 'Payment confirmed', html);
  }
}
