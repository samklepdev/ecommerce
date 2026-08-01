import { Worker } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';

import { BullMqJobQueue, createQueueConnection, QUEUE_NAME } from './bullmq-job-queue';
import { jobIdFor } from '@/shared/application/ports/job-queue';
import { TEST_REDIS_URL } from '../../../../tests/integration/config';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * Jobs against a real Redis, because everything interesting here is BullMQ's
 * behaviour rather than ours: whether a duplicate job id actually dedupes,
 * whether a thrown handler is retried, and whether a job that exhausts its
 * attempts stays visible instead of vanishing.
 */
describe('BullMqJobQueue (integration)', () => {
  // The harness gives the wipe-between-tests behaviour; BullMQ gets its own
  // connections, as it does in production.
  useTestInfrastructure();
  const workers: Worker[] = [];

  afterEach(async () => {
    await Promise.all(workers.map((w) => w.close()));
    workers.length = 0;
  });

  /** Runs the queue with a handler, and resolves once `expected` jobs have
   * finished — success or final failure. */
  function runWorker(handler: (name: string, data: unknown) => Promise<void>) {
    const worker = new Worker(QUEUE_NAME, async (job) => handler(job.name, job.data), {
      connection: createQueueConnection(TEST_REDIS_URL),
      concurrency: 1,
    });
    workers.push(worker);
    return worker;
  }

  const settled = (worker: Worker, count: number, event: 'completed' | 'failed' = 'completed') =>
    new Promise<void>((resolve) => {
      let seen = 0;
      worker.on(event, () => {
        seen += 1;
        if (seen >= count) resolve();
      });
    });

  it('delivers an enqueued job to the worker with its payload intact', async () => {
    const queue = new BullMqJobQueue(TEST_REDIS_URL);
    const received: unknown[] = [];
    const worker = runWorker(async (name, data) => {
      received.push({ name, data });
    });
    const done = settled(worker, 1);

    await queue.enqueue('email.welcome', { userId: 'u1', email: 'a@example.com' });
    await done;

    expect(received).toEqual([
      { name: 'email.welcome', data: { userId: 'u1', email: 'a@example.com' } },
    ]);
    await queue.close();
  });

  // The watcher re-runs its pass every ~45s over the same orders, so this is
  // the normal case, not an edge one: without it, a paid order would queue
  // its fulfilment work again on every pass.
  // Also pins the id format: BullMQ rejects a colon in a custom id, and the
  // obvious `type:id` shape throws at enqueue rather than being caught by a
  // type. Every id this app builds looks like the one below.
  it('does not queue the same job id twice', async () => {
    const queue = new BullMqJobQueue(TEST_REDIS_URL);
    let handled = 0;
    const worker = runWorker(async () => {
      handled += 1;
    });
    const done = settled(worker, 1);

    const payload = { orderId: 'order-1' };
    await queue.enqueue('fulfillment.create-supplier-orders', payload, { jobId: 'fulfillment-order-1' });
    await queue.enqueue('fulfillment.create-supplier-orders', payload, { jobId: 'fulfillment-order-1' });
    await queue.enqueue('fulfillment.create-supplier-orders', payload, { jobId: 'fulfillment-order-1' });
    await done;

    expect(handled).toBe(1);
    await queue.close();
  });

  it('retries a handler that throws, rather than losing the work', async () => {
    const queue = new BullMqJobQueue(TEST_REDIS_URL);
    let attempts = 0;
    const worker = runWorker(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('mail provider timed out');
    });
    const done = settled(worker, 1);

    await queue.enqueue('email.payment-confirmed', { orderId: 'order-2' });
    await done;

    // Third attempt succeeded — the first two would previously have been the
    // end of it, with the email simply never sent.
    expect(attempts).toBe(3);
    await queue.close();
  });

  it('keeps a job that exhausts its attempts, so it can be found later', async () => {
    // Same behaviour as production, without waiting out real backoff.
    const queue = new BullMqJobQueue(TEST_REDIS_URL, { attempts: 2, backoffDelayMs: 10 });
    const worker = runWorker(async () => {
      throw new Error('always fails');
    });
    const done = settled(worker, 2, 'failed');

    await queue.enqueue('email.verification', { userId: 'u2', email: 'b@example.com' });
    await done;

    // BullMQ's failed set is the dead-letter queue: once attempts run out
    // the job sits there rather than disappearing.
    const stats = await queue.stats();
    expect(stats.failed).toBeGreaterThanOrEqual(1);
    await queue.close();
  });

  describe('re-queueing work that already failed', () => {
    /**
     * The defect this exists for, and it needed a real Redis to see.
     *
     * A job that exhausts its attempts stays in the failed set, and
     * `removeOnFail` keeps its key for 14 days. BullMQ's `addStandardJob`
     * checks `EXISTS jobIdKey` **before looking at state** and, if the key is
     * there, returns the existing id via `handleDuplicatedJob` — nothing is
     * stored, nothing is queued, and `queue.add` resolves normally.
     *
     * `ReconcileUnsourcedPaidOrders` exists precisely to re-queue sourcing
     * that went missing, and it uses a stable id (`fulfillment-<orderId>`). So
     * for the entire retention window it logged "re-queued sourcing" every
     * pass and queued nothing at all — a paid order with nothing ordered, and
     * a log line asserting it had been fixed.
     */
    it('silently drops a plain re-enqueue while the failed job is retained', async () => {
      const queue = new BullMqJobQueue(TEST_REDIS_URL, { attempts: 1, backoffDelayMs: 10 });
      const failing = runWorker(async () => {
        throw new Error('always fails');
      });
      const jobId = jobIdFor('fulfillment', 'order-requeue-1');

      await queue.enqueue('fulfillment.create-supplier-orders', { orderId: 'order-requeue-1' }, { jobId });
      await settled(failing, 1, 'failed');
      await failing.close();

      // The plain re-enqueue: accepted, and a no-op.
      await queue.enqueue('fulfillment.create-supplier-orders', { orderId: 'order-requeue-1' }, { jobId });

      const stats = await queue.stats();
      expect(stats.waiting).toBe(0);
      await queue.close();
    });

    it('actually re-queues when the caller asks to replace', async () => {
      const queue = new BullMqJobQueue(TEST_REDIS_URL, { attempts: 1, backoffDelayMs: 10 });
      const failing = runWorker(async () => {
        throw new Error('always fails');
      });
      const jobId = jobIdFor('fulfillment', 'order-requeue-2');

      await queue.enqueue('fulfillment.create-supplier-orders', { orderId: 'order-requeue-2' }, { jobId });
      await settled(failing, 1, 'failed');
      await failing.close();

      await queue.enqueue(
        'fulfillment.create-supplier-orders',
        { orderId: 'order-requeue-2' },
        { jobId, replaceExisting: true },
      );

      // Queued for real this time, and the stale failure is gone rather than
      // left to look like an outstanding problem.
      const stats = await queue.stats();
      expect(stats.waiting).toBe(1);
      expect(stats.failed).toBe(0);
      await queue.close();
    });

    it('keeps the deterministic id, so two replacing calls still queue once', async () => {
      // Replacing must not turn the reconciler into a job generator: it runs
      // every watcher pass, and the id is still what stops a pile-up.
      const queue = new BullMqJobQueue(TEST_REDIS_URL, { attempts: 1, backoffDelayMs: 10 });
      const jobId = jobIdFor('fulfillment', 'order-requeue-3');

      await queue.enqueue(
        'fulfillment.create-supplier-orders',
        { orderId: 'order-requeue-3' },
        { jobId, replaceExisting: true },
      );
      await queue.enqueue(
        'fulfillment.create-supplier-orders',
        { orderId: 'order-requeue-3' },
        { jobId, replaceExisting: true },
      );

      expect((await queue.stats()).waiting).toBe(1);
      await queue.close();
    });
  });

  describe('stats', () => {
    it('counts waiting work with no worker running', async () => {
      const queue = new BullMqJobQueue(TEST_REDIS_URL);

      await queue.enqueue('email.welcome', { userId: 'u3', email: 'c@example.com' });
      await queue.enqueue('email.welcome', { userId: 'u4', email: 'd@example.com' });

      const stats = await queue.stats();
      expect(stats.waiting).toBe(2);
      expect(stats.failed).toBe(0);
      await queue.close();
    });

    it('is zero on an untouched queue', async () => {
      const queue = new BullMqJobQueue(TEST_REDIS_URL);

      expect(await queue.stats()).toEqual({ waiting: 0, active: 0, failed: 0 });
      await queue.close();
    });
  });
});
