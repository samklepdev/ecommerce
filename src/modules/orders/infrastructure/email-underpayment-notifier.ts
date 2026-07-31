import { logger } from '@/shared/infrastructure/logger';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';
import type { OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import { renderUnderpaidEmail } from '@/modules/notifications/application/order-email-templates';

/**
 * Emails a part-paying customer the balance.
 *
 * Reads both the order (for the address to mail) and the payment intent (for the
 * three amounts), because the watcher only ever hands over an order id — the
 * same shape as `EmailPaymentConfirmationNotifier`.
 *
 * The outstanding figure comes from `expectedSats − confirmedSats` on the
 * intent, which is the original quote's number rather than a fresh one. Once
 * money is in flight the amount owed is settled; re-quoting would move the
 * goalposts under a payment already made.
 */
export class EmailUnderpaymentNotifier implements UnderpaymentNotifier {
  constructor(
    private readonly orderHistory: OrderHistoryRepository,
    private readonly payments: BitcoinPaymentStore,
    private readonly emailSender: EmailSender,
    private readonly appUrl: string,
    private readonly supportEmail: string,
  ) {}

  async notifyUnderpaid(orderId: string): Promise<void> {
    const [order, intent] = await Promise.all([
      this.orderHistory.findById(orderId),
      this.payments.getByOrderId(orderId),
    ]);
    // Not an error: the watcher is a loop over whatever is currently watchable,
    // and an order deleted mid-flight simply has nobody to mail.
    if (!order || !intent) {
      logger.warn('underpayment email skipped: order or payment intent missing', { orderId });
      return;
    }

    const confirmedSats = intent.confirmedSats ?? 0;
    const outstandingSats = Math.max(0, intent.expectedSats - confirmedSats);
    if (outstandingSats === 0) {
      // Topped up between the watcher deciding to notify and this job running.
      // Mailing "you owe 0.00000000 BTC" would be worse than saying nothing.
      logger.info('underpayment email skipped: nothing outstanding any more', { orderId });
      return;
    }

    const { html, text } = await renderUnderpaidEmail({
      orderId: order.id,
      orderUrl: `${this.appUrl}/orders/${order.id}`,
      receivedBtc: satsToBtcString(confirmedSats),
      expectedBtc: satsToBtcString(intent.expectedSats),
      outstandingBtc: satsToBtcString(outstandingSats),
      address: intent.address,
      supportEmail: this.supportEmail,
    });

    await this.emailSender.send({
      to: order.customerEmail,
      subject: 'Your payment was short — balance still owed',
      html,
      text,
    });
  }
}
