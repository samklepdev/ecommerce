import { jobIdFor, type JobQueue } from '@/shared/application/ports/job-queue';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';

/**
 * The "you still owe" email, queued rather than sent from the watcher's pass.
 *
 * Same reasoning as `QueuedPaymentConfirmationNotifier`: the watcher is the only
 * thing that notices money arriving, and it must not sit inside a mail
 * provider's timeout while other orders wait to be polled.
 *
 * The job id is the order id. That's belt-and-braces only — `NotifyUnderpaidOnce`
 * is what actually stops this being sent on every 45-second pass, since BullMQ's
 * de-dupe lasts only as long as the completed job is retained.
 */
export class QueuedUnderpaymentNotifier implements UnderpaymentNotifier {
  constructor(private readonly jobs: JobQueue) {}

  async notifyUnderpaid(orderId: string): Promise<void> {
    await this.jobs.enqueue(
      'email.underpaid',
      { orderId },
      { jobId: jobIdFor('underpaid', orderId) },
    );
  }
}
