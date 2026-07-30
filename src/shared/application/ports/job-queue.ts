/**
 * Work that happens after the response.
 *
 * Everything here used to run inline: a customer waited for Resend before
 * their order confirmation page rendered, and the watcher waited for
 * supplier-order creation before it could poll the next address. Worse, a
 * failure was simply lost — there was no retry and nothing recording that
 * the attempt had happened at all.
 *
 * The payload of every job is **ids, not objects**. A job may run minutes
 * after it was enqueued, on another process, after a deploy: anything it
 * carries is a snapshot that may already be wrong, so it carries the
 * smallest thing that lets the handler go and read the current truth.
 */
export interface JobPayloads {
  'email.order-confirmation': { orderId: string; customerEmail: string };
  'email.welcome': { userId: string; email: string };
  'email.verification': { userId: string; email: string };
  'email.payment-confirmed': { orderId: string };
  'fulfillment.create-supplier-orders': { orderId: string };
}

export type JobName = keyof JobPayloads;

export interface EnqueueOptions {
  /**
   * A stable id makes the enqueue idempotent: the same job asked for twice
   * is only queued once, which matters because the watcher re-runs its pass
   * every 45 seconds over the same orders.
   *
   * **No colons.** BullMQ rejects them outright ("Custom Id cannot contain
   * :"), because it builds its own Redis keys with colon separators. The
   * obvious `type:id` shape therefore throws at enqueue time rather than
   * failing a check — use hyphens.
   */
  jobId?: string;
}

export interface JobQueue {
  enqueue<T extends JobName>(
    name: T,
    payload: JobPayloads[T],
    options?: EnqueueOptions,
  ): Promise<void>;
}

/** Depths for `/api/health`, so a queue that has stopped draining is visible
 * before anyone notices the emails stopped. */
export interface JobQueueStats {
  waiting: number;
  active: number;
  failed: number;
}

export interface JobQueueMonitor {
  stats(): Promise<JobQueueStats>;
}
