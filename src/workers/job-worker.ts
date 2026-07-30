import { Worker, type Job } from 'bullmq';

import { env } from '@/config/env';
import { Money } from '@/shared/domain/money';
import { logger } from '@/shared/infrastructure/logger';
import { createQueueConnection, QUEUE_NAME } from '@/shared/infrastructure/queue/bullmq-job-queue';
import type { JobName, JobPayloads } from '@/shared/application/ports/job-queue';
import type { getContainer } from '@/composition/container';

type Container = ReturnType<typeof getContainer>;

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
export function createJobWorker(redisUrl: string, container: Container): Worker {
  const handlers: {
    [T in JobName]: (payload: JobPayloads[T]) => Promise<void>;
  } = {
    'email.order-confirmation': async ({ orderId, customerEmail }) => {
      // Read at send time rather than carried in the payload: the job may
      // run after an admin has edited the order, and the email should
      // describe what is true when it goes out.
      const order = await container.getOrderDetail.execute({ orderId });
      if (!order) {
        // Deleted between enqueue and now. Nothing to send and nothing to
        // retry, so it counts as done rather than failed.
        logger.warn('order-confirmation job: order no longer exists', { orderId });
        return;
      }
      await container.sendOrderConfirmationEmail.execute({
        customerEmail,
        orderId,
        lines: order.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        totalDisplay: Money.of(order.amountMinor, order.currency).toDisplayString(),
        orderUrl: `${env.APP_URL}/orders/${orderId}`,
      });
    },

    'email.welcome': async ({ userId, email }) => {
      await container.sendWelcomeEmail.execute({ userId, email });
    },

    'email.verification': async ({ userId, email }) => {
      await container.requestEmailVerification.execute({ userId, email });
    },

    'email.payment-confirmed': async ({ orderId }) => {
      await container.paymentConfirmationEmail.notifyPaymentConfirmed(orderId);
    },

    'fulfillment.create-supplier-orders': async ({ orderId }) => {
      await container.createSupplierOrdersForPaidOrder.execute({ orderId });
    },
  };

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = handlers[job.name as JobName];
      if (!handler) {
        // An unknown name is a deploy that removed a job type while some
        // were still queued. Dropping it beats retrying it forever.
        logger.error('job worker: no handler for job', { job: job.name, jobId: job.id });
        return;
      }
      await handler(job.data);
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
