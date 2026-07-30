import { Queue } from 'bullmq';
import Redis from 'ioredis';

import { logger } from '@/shared/infrastructure/logger';
import type {
  EnqueueOptions,
  JobName,
  JobPayloads,
  JobQueue,
  JobQueueMonitor,
  JobQueueStats,
} from '@/shared/application/ports/job-queue';

export const QUEUE_NAME = 'storefront';

/**
 * Retry policy, applied to every job.
 *
 * Five attempts with exponential backoff from two seconds covers what
 * actually goes wrong here — a mail provider rate-limiting us, a supplier
 * lookup hitting a database blip — without hammering a service that is
 * already unhappy. Anything that fails all five stays in BullMQ's failed
 * set rather than disappearing: that set is the dead-letter queue, and
 * `/api/health` counts it.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoffDelayMs: 2_000,
};

/** Completed jobs are kept briefly, not forever: enough to see that things
 * are flowing, not enough to grow without bound. Failures are kept much
 * longer, because they're the ones somebody has to look at. */
const RETENTION = {
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 60 * 60 * 24 * 14 },
};

export interface RetryPolicy {
  attempts: number;
  backoffDelayMs: number;
}

/**
 * BullMQ needs `maxRetriesPerRequest: null` on its connection — with
 * ioredis' default of 20, a blocking command gets aborted mid-wait and the
 * client throws. So the queue owns its connection rather than sharing the
 * app's, which is configured for short request-path calls and should stay
 * that way.
 */
export function createQueueConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    // `lazyConnect` for the same reason `redis/client.ts` uses it: the DI
    // container builds a queue unconditionally (`container.ts`), so importing
    // the container must not open a socket — `next build` renders pages with
    // no Redis running. Without this, constructing the queue alone against a
    // dead Redis emits ~13 `[ioredis] Unhandled error event: connect
    // ECONNREFUSED` in four seconds; with it, none until a command is issued.
    lazyConnect: true,
  });
}

export class BullMqJobQueue implements JobQueue, JobQueueMonitor {
  private readonly queue: Queue;
  private readonly connection: Redis;

  /** The retry policy is a constructor argument so a test can exercise
   * exhaustion without waiting out real exponential backoff. Production
   * never passes it. */
  constructor(
    redisUrl: string,
    private readonly retry: RetryPolicy = DEFAULT_JOB_OPTIONS,
  ) {
    this.connection = createQueueConnection(redisUrl);
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  async enqueue<T extends JobName>(
    name: T,
    payload: JobPayloads[T],
    options: EnqueueOptions = {},
  ): Promise<void> {
    await this.queue.add(name, payload, {
      ...RETENTION,
      attempts: this.retry.attempts,
      backoff: { type: 'exponential', delay: this.retry.backoffDelayMs },
      jobId: options.jobId,
    });
    logger.info('job enqueued', { job: name, jobId: options.jobId ?? null });
  }

  async stats(): Promise<JobQueueStats> {
    const counts = await this.queue.getJobCounts('waiting', 'active', 'failed');
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
