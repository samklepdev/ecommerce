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

/**
 * The late-payment sweep's clock. Hourly, not per-pass: it costs one provider
 * call per recently-closed order, and nothing about it is time-critical — the
 * money has already arrived and the order is already closed, so the question is
 * whether anyone finds out today, not within the minute.
 */
const LATE_PAYMENT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const container = getContainer();
  const {
    watchBitcoinPayments,
    expireStaleCheckouts,
    pruneAnalyticsEvents,
    failStuckAwaitingConfirmationOrders,
    warnStuckAwaitingConfirmationOrders,
    reconcileUnsourcedPaidOrders,
    sweepLatePayments,
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
  // Deliberately starts at "now" rather than 0, unlike the prune above: on a
  // box that restarts often, sweeping on every boot would hammer the chain
  // provider for no benefit — nothing can have arrived since the last sweep
  // moments ago.
  let lastSweptAt = Date.now();

  while (running) {
    const started = Date.now();

    // Only this one gates the heartbeat. The two reconciliation passes below
    // are housekeeping — if they fail while the chain poll succeeds, payment
    // detection is still working and the process should not be reported dead.
    let chainPassOk = true;
    try {
      const pass = await watchBitcoinPayments.runOnce();
      /**
       * A pass that had work to do and could not read the chain for any of it
       * is a dead watcher, whatever the process is doing.
       *
       * `runOnce` catches per intent so one bad address can't stop the rest,
       * which meant it never threw — so this stayed true through an Esplora
       * outage, the heartbeat kept being written, and `/api/health` reported
       * ok while no order settled and no confirmation email went out. The
       * heartbeat proved the process was alive, which was never the question.
       *
       * All-or-nothing rather than a ratio: a single address failing is
       * ordinary (a malformed row, a provider hiccup) and self-heals next
       * pass, while every address failing is the provider being gone. A pass
       * with nothing to watch is the normal quiet state and stays healthy.
       */
      if (pass.polled > 0 && pass.failed === pass.polled) {
        chainPassOk = false;
        logger.error('btc-watcher could not read the chain for any watched address', {
          polled: pass.polled,
        });
      }
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

    /**
     * Before the pass that fails them, so an order crossing both thresholds in
     * one tick is warned rather than only failed. The warning is deduped per
     * order, so in the normal case it went out hours ago and this is a no-op.
     */
    try {
      await warnStuckAwaitingConfirmationOrders.execute();
    } catch (e) {
      logger.error('btc-watcher warn-stuck-awaiting-confirmation-orders pass failed', {
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

    if (Date.now() - lastSweptAt >= LATE_PAYMENT_SWEEP_INTERVAL_MS) {
      lastSweptAt = Date.now();
      try {
        await sweepLatePayments.execute();
      } catch (e) {
        // Housekeeping, like the passes above: a failed sweep must not stop
        // the chain poll, which is what actually settles orders.
        logger.error('btc-watcher late-payment sweep failed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Every pass, like the two above: one indexed query whose result set should
    // always be empty. When it isn't, a paid order is sitting unfulfilled and
    // invisible, and every pass it waits is a customer waiting.
    try {
      await reconcileUnsourcedPaidOrders.execute();
    } catch (e) {
      logger.error('btc-watcher reconcile-unsourced-paid-orders pass failed', {
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
