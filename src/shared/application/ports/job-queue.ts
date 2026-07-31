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
  'email.underpaid': { orderId: string };
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
   * failing a check — so don't build this by hand, use `jobIdFor` below.
   *
   * Omit it entirely for work a caller can legitimately repeat (a resend
   * button); see the note on `jobIdFor`.
   */
  jobId?: string;
}

/**
 * Builds a job id, and is the only thing that should.
 *
 * The no-colon rule above used to be enforced by a comment, with four call
 * sites assembling ids by hand — which is how every id shipped as `type:id`
 * and threw at enqueue time. Routing them through here makes the rule
 * structural: a colon can't reach BullMQ because this replaces it.
 *
 * Dots go the same way, so a job name can be passed straight in
 * (`jobIdFor('email.welcome', userId)` → `email-welcome-<userId>`), which is
 * what the call sites were already spelling out longhand.
 *
 * Sanitising rather than throwing on a colon is deliberate: a throw here
 * would reproduce the original failure — invisible to types, discovered at
 * runtime in the request path. An empty part *does* throw, because unlike a
 * colon it can't be corrected: it collapses `fulfillment-<orderId>` to
 * `fulfillment-` for every order, deduping unrelated money-touching jobs
 * into one another.
 */
export function jobIdFor(...parts: string[]): string {
  if (parts.length === 0 || parts.some((part) => part.trim() === '')) {
    throw new Error(`jobIdFor: refusing to build an id from an empty part (${JSON.stringify(parts)})`);
  }
  return parts.join('-').replaceAll(/[:.]/g, '-');
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
