import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import { BTC_WATCHER_HEARTBEAT } from '@/shared/application/ports/health-ports';
import { logger } from '@/shared/infrastructure/logger';
import { createJobWorker } from '@/workers/job-worker';

/**
 * Standalone worker: polls the chain for awaiting BTC payments and drives
 * ConfirmPayment, then reconciles stale reservations. It also hosts the BullMQ
 * job worker (see below). This is the `worker` service in docker-compose
 * (separate process from the Next `web` service).
 *
 * **The chain poll stays an interval loop rather than a BullMQ repeat job**, and
 * deliberately: it is a poller with a heartbeat `/api/health` already watches, so
 * converting the one thing that notices a customer paid would buy observability
 * it has. Because each pass reconciles from chain state, a restart never loses a
 * payment: confirmations arrive a cycle late at worst.
 *
 * **Run exactly one of these.** There is no lock or leader election, so a
 * second replica just doubles the load on the Esplora provider (the work
 * itself is idempotent — ConfirmPayment de-dupes by event id).
 *
 * It records a heartbeat after every pass in which the chain poll itself
 * succeeded. `/api/health` reads it and fails when it goes stale, because
 * this process dying is otherwise completely silent: orders simply stop
 * settling, and the first report comes from a customer.
 */
const INTERVAL_MS = env.BTC_WATCH_INTERVAL_MS;

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const container = getContainer();
  const {
    watchBitcoinPayments,
    expireStaleCheckouts,
    pruneAnalyticsEvents,
    failStuckAwaitingConfirmationOrders,
    heartbeats,
  } = container;
  logger.info('btc-watcher starting', { intervalMs: INTERVAL_MS });

  // Same process as the chain poll, on purpose: two long-running processes
  // to deploy and monitor is worse than one for a shop this size, and the
  // job worker is idle most of the time. Split them when the queue's volume
  // starts competing with the poll for the interval.
  const jobWorker = createJobWorker(env.REDIS_URL, { ...container, appUrl: env.APP_URL });
  logger.info('job worker started');

  let running = true;
  const shutdown = async () => {
    running = false;
    logger.info('btc-watcher shutting down');
    // Closed before exit so an in-flight job finishes rather than being
    // retried from scratch on the next boot.
    await jobWorker.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Runs once now and then daily. "Now" is deliberate: on a box that gets
  // redeployed more often than once a day, a job that only fires after 24h
  // of uptime never fires at all.
  let lastPrunedAt = 0;

  while (running) {
    const started = Date.now();

    // Only this one gates the heartbeat. The two reconciliation passes below
    // are housekeeping — if they fail while the chain poll succeeds, payment
    // detection is still working and the process should not be reported dead.
    let chainPassOk = true;
    try {
      await watchBitcoinPayments.runOnce();
    } catch (e) {
      chainPassOk = false;
      logger.error('btc-watcher pass failed', { error: e instanceof Error ? e.message : String(e) });
    }

    try {
      await expireStaleCheckouts.execute();
    } catch (e) {
      logger.error('btc-watcher expire-stale-checkouts pass failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      await failStuckAwaitingConfirmationOrders.execute();
    } catch (e) {
      logger.error('btc-watcher fail-stuck-awaiting-confirmation-orders pass failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Housekeeping on a much slower clock than the chain poll. Guarded by
    // wall-clock rather than a tick count so a restart loop can't turn a
    // daily job into a per-boot one.
    if (Date.now() - lastPrunedAt >= PRUNE_INTERVAL_MS) {
      lastPrunedAt = Date.now();
      try {
        await pruneAnalyticsEvents.execute();
      } catch (e) {
        logger.error('btc-watcher analytics prune failed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (chainPassOk) {
      try {
        await heartbeats.record(BTC_WATCHER_HEARTBEAT, new Date());
      } catch (e) {
        // Never fatal: a Redis blip must not take down payment detection.
        // /api/health reports Redis separately anyway.
        logger.warn('btc-watcher heartbeat write failed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const elapsed = Date.now() - started;
    await sleep(Math.max(0, INTERVAL_MS - elapsed));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => {
  logger.error('btc-watcher fatal', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
