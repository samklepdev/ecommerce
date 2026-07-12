import { getContainer } from '@/composition/container';

/**
 * Standalone worker: periodically syncs supplier offer price/availability/
 * title/image from each supplier's product page. Ticks hourly, but
 * SyncAllDueSupplierOffers decides what's actually due based on
 * SUPPLIER_SYNC_INTERVAL_HOURS (default daily) — the tick rate here is just
 * how often we check, not how often any single offer gets re-fetched.
 */
const TICK_MS = 60 * 60 * 1000; // 1 hour

async function main(): Promise<void> {
  const { syncAllDueSupplierOffers } = getContainer();
  console.log(`[supplier-sync] starting, tick=${TICK_MS}ms`);

  let running = true;
  const shutdown = () => {
    running = false;
    console.log('[supplier-sync] shutting down');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (running) {
    const started = Date.now();
    try {
      await syncAllDueSupplierOffers.execute();
    } catch (e) {
      console.error('[supplier-sync] pass failed:', e);
    }
    const elapsed = Date.now() - started;
    await sleep(Math.max(0, TICK_MS - elapsed));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => {
  console.error('[supplier-sync] fatal:', e);
  process.exit(1);
});
