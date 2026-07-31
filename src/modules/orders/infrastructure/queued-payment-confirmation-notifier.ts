import type { PaymentConfirmationNotifier } from '@/modules/orders/application/ports/payment-confirmation-notifier';
import { jobIdFor, type JobQueue } from '@/shared/application/ports/job-queue';

/**
 * The "your payment confirmed" email, queued rather than sent from the
 * watcher's pass.
 *
 * Same reasoning as `QueuedFulfillmentQueue`: the watcher is the only thing
 * that notices a customer paid, and it should not be inside a mail
 * provider's timeout while other orders wait to be polled.
 *
 * The job id is the order id — a payment confirms once, and the watcher's
 * repeated passes must not turn that into repeated mail.
 */
export class QueuedPaymentConfirmationNotifier implements PaymentConfirmationNotifier {
  constructor(private readonly jobs: JobQueue) {}

  async notifyPaymentConfirmed(orderId: string): Promise<void> {
    await this.jobs.enqueue(
      'email.payment-confirmed',
      { orderId },
      { jobId: jobIdFor('payment-confirmed', orderId) },
    );
  }
}
