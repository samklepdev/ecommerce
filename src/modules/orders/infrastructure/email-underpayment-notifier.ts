import { logger } from '@/shared/infrastructure/logger';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';
import type { OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import { renderUnderpaidEmail } from '@/modules/notifications/application/order-email-templates';
import { formatTopUpDeadline } from '@/modules/orders/domain/top-up-deadline';

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
    /** `AWAITING_CONFIRMATION_WINDOW_HOURS`. Needed to state the top-up
     * deadline: this email used to say the amount owed "won't move while you
     * finish paying" and name no limit at all, which reads as unlimited time.
     * It is not — when the window runs out the order is marked `failed`,
     * terminal, and what they already sent is gone. */
    private readonly awaitingConfirmationWindowHours: number,
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
    // Unconfirmed value counts against what's owed, for the same reason
    // `GetPaymentProgress` subtracts it: this number is what the customer is
    // asked to send, and asking again for sats already in the mempool is how
    // an accidental overpayment happens — with no refund mechanism to undo it.
    const pendingSats = intent.pendingSats ?? 0;
    const outstandingSats = Math.max(0, intent.expectedSats - confirmedSats - pendingSats);
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
      topUpDeadline: formatTopUpDeadline(
        order.awaitingConfirmationSince,
        this.awaitingConfirmationWindowHours,
      ),
    });

    await this.emailSender.send({
      to: order.customerEmail,
      subject: 'Your payment was short — balance still owed',
      html,
      text,
    });
  }
}
