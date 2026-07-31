import { Worker, type Job } from 'bullmq';

import { Money } from '@/shared/domain/money';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import { createQueueConnection, QUEUE_NAME } from '@/shared/infrastructure/queue/bullmq-job-queue';
import { isJobName, parseJobPayload } from '@/shared/infrastructure/queue/job-payload-schemas';
import type { JobName, JobPayloads } from '@/shared/application/ports/job-queue';
import type { OrderConfirmationEmailLine } from '@/modules/notifications/application/order-email-templates';

/**
 * The minimal shapes the handlers actually need — the same convention as
 * `OrderConfirmationEmailSender` in `ResendOrderConfirmations`. The real DI
 * container satisfies this structurally, so `createJobWorker(url, {
 * ...container, appUrl })` still works, and a test can supply its own
 * collaborators without standing up a container.
 *
 * This used to be `ReturnType<typeof getContainer>`, which pulled the entire
 * DI root in for five collaborators and made the worker unusable from
 * anywhere that doesn't have one — including the integration test, which had
 * to re-implement the dispatch to get around it.
 *
 * `appUrl` is injected rather than read from `env` here so this module reads
 * no environment at all: that's what lets the integration suite import it
 * without loading the app's env schema.
 */
export interface JobWorkerDeps {
  appUrl: string;
  getOrderDetail: {
    execute(input: { orderId: string }): Promise<{
      lines: { productName: string; quantity: number }[];
      amountMinor: number;
      currency: string;
    } | null>;
  };
  sendOrderConfirmationEmail: {
    execute(input: {
      customerEmail: string;
      orderId: string;
      lines: OrderConfirmationEmailLine[];
      totalDisplay: string;
      orderUrl: string;
    }): Promise<void>;
  };
  sendWelcomeEmail: { execute(input: { userId: string; email: string }): Promise<void> };
  requestEmailVerification: { execute(input: { userId: string; email: string }): Promise<void> };
  paymentConfirmationEmail: { notifyPaymentConfirmed(orderId: string): Promise<void> };
  underpaymentEmail: { notifyUnderpaid(orderId: string): Promise<void> };
  createSupplierOrdersForPaidOrder: { execute(input: { orderId: string }): Promise<void> };
}

/**
 * Parses before handling, and drops rather than retries what doesn't parse.
 *
 * `job.data` is `any` off Redis and may have been enqueued by a previous
 * deploy, so it's parsed at this boundary like any other external input. A
 * payload that fails to parse won't parse on the fifth attempt either —
 * retrying it only delays the failed-set entry somebody has to look at — so
 * it's logged loudly and the job is completed.
 */
function parsedHandler<T extends JobName>(
  name: T,
  handle: (payload: JobPayloads[T]) => Promise<void>,
): (raw: unknown) => Promise<void> {
  return async (raw: unknown) => {
    const parsed = parseJobPayload(name, raw);
    if (isErr(parsed)) {
      logger.error('job worker: payload did not parse, dropping job', {
        job: name,
        error: parsed.error,
      });
      return;
    }
    await handle(parsed.value);
  };
}

/**
 * Runs the jobs the request path used to run itself.
 *
 * Handlers do the work through the same use cases as before — the change is
 * *when* and *where*, not *what*. Each one is written to be safe to run
 * again, because BullMQ retries and "exactly once" is not a thing a queue
 * can offer:
 *
 * - `CreateSupplierOrdersForPaidOrder` skips lines a supplier order already
 *   covers, so a second run adds only what's missing.
 * - The email use cases are the same ones the inline path called; a retry
 *   after a provider timeout can duplicate a message, which is the right
 *   trade against never sending it.
 */
export function createJobWorker(redisUrl: string, deps: JobWorkerDeps): Worker {
  const handlers: { [T in JobName]: (raw: unknown) => Promise<void> } = {
    'email.order-confirmation': parsedHandler(
      'email.order-confirmation',
      async ({ orderId, customerEmail }) => {
        // Read at send time rather than carried in the payload: the job may
        // run after an admin has edited the order, and the email should
        // describe what is true when it goes out.
        const order = await deps.getOrderDetail.execute({ orderId });
        if (!order) {
          // Deleted between enqueue and now. Nothing to send and nothing to
          // retry, so it counts as done rather than failed.
          logger.warn('order-confirmation job: order no longer exists', { orderId });
          return;
        }
        await deps.sendOrderConfirmationEmail.execute({
          customerEmail,
          orderId,
          lines: order.lines.map((line) => ({ productName: line.productName, quantity: line.quantity })),
          totalDisplay: Money.of(order.amountMinor, order.currency).toDisplayString(),
          orderUrl: `${deps.appUrl}/orders/${orderId}`,
        });
      },
    ),

    'email.welcome': parsedHandler('email.welcome', async ({ userId, email }) => {
      await deps.sendWelcomeEmail.execute({ userId, email });
    }),

    'email.verification': parsedHandler('email.verification', async ({ userId, email }) => {
      await deps.requestEmailVerification.execute({ userId, email });
    }),

    'email.payment-confirmed': parsedHandler('email.payment-confirmed', async ({ orderId }) => {
      await deps.paymentConfirmationEmail.notifyPaymentConfirmed(orderId);
    }),

    'email.underpaid': parsedHandler('email.underpaid', async ({ orderId }) => {
      await deps.underpaymentEmail.notifyUnderpaid(orderId);
    }),

    'fulfillment.create-supplier-orders': parsedHandler(
      'fulfillment.create-supplier-orders',
      async ({ orderId }) => {
        await deps.createSupplierOrdersForPaidOrder.execute({ orderId });
      },
    ),
  };

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (!isJobName(job.name)) {
        // An unknown name is a deploy that removed a job type while some
        // were still queued. Dropping it beats retrying it forever.
        logger.error('job worker: no handler for job', { job: job.name, jobId: job.id });
        return;
      }
      await handlers[job.name](job.data);
    },
    {
      // Its own connection, not the app's: a Worker blocks on Redis waiting
      // for jobs, which needs settings the request path must not have.
      connection: createQueueConnection(redisUrl),
      // Modest: these handlers talk to Postgres and a mail provider, and the
      // point of moving them off the request path was to stop them competing
      // with it for the same resources.
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.info('job completed', { job: job.name, jobId: job.id });
  });

  worker.on('failed', (job, error) => {
    // Logged at every attempt, not just the last: a job that eventually
    // succeeds after three failures is still telling you something.
    logger.error('job failed', {
      job: job?.name ?? 'unknown',
      jobId: job?.id ?? null,
      attempt: job?.attemptsMade ?? 0,
      willRetry: (job?.attemptsMade ?? 0) < (job?.opts.attempts ?? 1),
      error: error.message,
    });
  });

  return worker;
}
