import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import { BTC_WATCHER_HEARTBEAT } from '@/shared/application/ports/health-ports';
import { logger } from '@/shared/infrastructure/logger';

/**
 * Standalone worker: polls the chain for awaiting BTC payments and drives
 * ConfirmPayment, then reconciles stale reservations. This is the `worker`
 * service in docker-compose (separate process from the Next `web` service).
 *
 * FIRST CUT — a simple interval loop. The production upgrade is a BullMQ repeat
 * job (dedupe + backoff + observability). Because each pass reconciles from
 * chain state, a restart never loses a payment: confirmations arrive a cycle
 * late at worst.
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

async function main(): Promise<void> {
  const {
    watchBitcoinPayments,
    expireStaleCheckouts,
    failStuckAwaitingConfirmationOrders,
    heartbeats,
  } = getContainer();
  logger.info('btc-watcher starting', { intervalMs: INTERVAL_MS });

  let running = true;
  const shutdown = () => {
    running = false;
    logger.info('btc-watcher shutting down');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

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
