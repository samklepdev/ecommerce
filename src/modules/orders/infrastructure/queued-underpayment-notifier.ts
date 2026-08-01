import type { JobQueue } from '@/shared/application/ports/job-queue';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';

/**
 * The "you still owe" email, queued rather than sent from the watcher's pass.
 *
 * Same reasoning as `QueuedPaymentConfirmationNotifier`: the watcher is the only
 * thing that notices money arriving, and it must not sit inside a mail
 * provider's timeout while other orders wait to be polled.
 *
 * **No job id, deliberately.** A stable one (`underpaid-<orderId>`) looks right
 * and silently breaks the feature: `NotifyUnderpaidOnce` re-notifies when the
 * *balance changes*, but BullMQ dedupes a repeated id for as long as the
 * completed job is retained (an hour). A customer who paid part of the balance
 * inside that window passed the once-only guard, had the enqueue dropped by
 * BullMQ, and was never told the new figure.
 *
 * This is CLAUDE.md's rule verbatim: don't give a stable id to something a
 * caller can legitimately repeat. `NotifyUnderpaidOnce` is the guard, and it is
 * keyed on the amount — so the job id must not add a second, coarser one.
 */
export class QueuedUnderpaymentNotifier implements UnderpaymentNotifier {
  constructor(private readonly jobs: JobQueue) {}

  async notifyUnderpaid(orderId: string): Promise<void> {
    await this.jobs.enqueue('email.underpaid', { orderId });
  }
}
