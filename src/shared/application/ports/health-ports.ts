/** A liveness probe against a backing service — implemented by the Drizzle
 * and Redis adapters. Resolves if the service answered, throws if it didn't;
 * the use case turns that into a status. */
export interface ServiceProbe {
  ping(): Promise<void>;
}

/**
 * Last-seen timestamps for background processes.
 *
 * The BTC watcher is the only thing that notices a customer paid, and it
 * runs as a single process with no HTTP surface of its own. It writes here
 * after every pass; `/api/health` reads it, so a watcher that has silently
 * died shows up as a failing health check instead of as orders that never
 * settle.
 */
export interface HeartbeatStore {
  record(name: string, at: Date): Promise<void>;
  lastSeen(name: string): Promise<Date | null>;
}

export const BTC_WATCHER_HEARTBEAT = 'btc-watcher';
