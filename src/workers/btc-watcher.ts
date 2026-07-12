import { env } from '@/config/env';
import { getContainer } from '@/composition/container';

/**
 * Standalone worker: polls the chain for awaiting BTC payments and drives
 * ConfirmPayment, then reconciles stale reservations. This is the `worker`
 * service in docker-compose (separate process from the Next `web` service).
 *
 * FIRST CUT — a simple interval loop. The production upgrade is a BullMQ repeat
 * job (dedupe + backoff + observability). Because each pass reconciles from
 * chain state, a restart never loses a payment: confirmations arrive a cycle
 * late at worst.
 */
const INTERVAL_MS = env.BTC_WATCH_INTERVAL_MS;

async function main(): Promise<void> {
  const { watchBitcoinPayments, expireStaleCheckouts } = getContainer();
  console.log(`[btc-watcher] starting, interval=${INTERVAL_MS}ms`);

  let running = true;
  const shutdown = () => {
    running = false;
    console.log('[btc-watcher] shutting down');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (running) {
    const started = Date.now();
    try {
      await watchBitcoinPayments.runOnce();
    } catch (e) {
      console.error('[btc-watcher] pass failed:', e);
    }
    try {
      await expireStaleCheckouts.execute();
    } catch (e) {
      console.error('[btc-watcher] expire-stale-checkouts pass failed:', e);
    }
    const elapsed = Date.now() - started;
    await sleep(Math.max(0, INTERVAL_MS - elapsed));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => {
  console.error('[btc-watcher] fatal:', e);
  process.exit(1);
});
