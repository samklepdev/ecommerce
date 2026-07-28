import type { UseCase } from '@/shared/application/use-case';
import {
  BTC_WATCHER_HEARTBEAT,
  type HeartbeatStore,
  type ServiceProbe,
} from '@/shared/application/ports/health-ports';

export type CheckStatus = 'ok' | 'fail';

export interface ServiceCheck {
  status: CheckStatus;
  /** Fixed code, never the underlying error — see the class doc. */
  reason?: 'unreachable';
}

export interface HeartbeatCheck {
  status: CheckStatus;
  reason?: 'stale' | 'never_reported';
  /** How long since the process last reported, null if it never has. */
  ageSeconds: number | null;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  checks: {
    database: ServiceCheck;
    redis: ServiceCheck;
    btcWatcher: HeartbeatCheck;
  };
}

/**
 * What `/api/health` answers with.
 *
 * The endpoint used to return a static `{status:'ok'}`, which meant it
 * reported healthy with Postgres on the floor — a load balancer would keep
 * routing to a process that could not serve a single page. It now actually
 * touches both backing services, and reads the BTC watcher's heartbeat.
 *
 * That last one is the important one. The watcher is a single process and
 * the only thing that notices a customer paid; if it dies, nothing else in
 * the system notices. A stale heartbeat turns that into a failing health
 * check, which any uptime monitor already knows how to page on.
 *
 * **The response is unauthenticated**, so it carries fixed reason codes and
 * never the underlying error — a connection error's message routinely
 * contains the credentials it failed to connect with.
 */
export class CheckSystemHealth implements UseCase<void, SystemHealth> {
  constructor(
    private readonly database: ServiceProbe,
    private readonly cache: ServiceProbe,
    private readonly heartbeats: HeartbeatStore,
    /** How long the watcher may go quiet before it counts as dead. */
    private readonly watcherStaleAfterMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<SystemHealth> {
    const [database, redis, btcWatcher] = await Promise.all([
      this.probe(this.database),
      this.probe(this.cache),
      this.checkWatcher(),
    ]);

    const status =
      database.status === 'ok' && redis.status === 'ok' && btcWatcher.status === 'ok'
        ? 'ok'
        : 'degraded';

    return { status, checks: { database, redis, btcWatcher } };
  }

  private async probe(service: ServiceProbe): Promise<ServiceCheck> {
    try {
      await service.ping();
      return { status: 'ok' };
    } catch {
      return { status: 'fail', reason: 'unreachable' };
    }
  }

  private async checkWatcher(): Promise<HeartbeatCheck> {
    let lastSeen: Date | null;
    try {
      lastSeen = await this.heartbeats.lastSeen(BTC_WATCHER_HEARTBEAT);
    } catch {
      // Redis is down, which the redis check already reports. Don't
      // double-count it as a dead watcher.
      return { status: 'fail', reason: 'never_reported', ageSeconds: null };
    }

    if (!lastSeen) return { status: 'fail', reason: 'never_reported', ageSeconds: null };

    const ageMs = this.now().getTime() - lastSeen.getTime();
    const ageSeconds = Math.round(ageMs / 1000);
    if (ageMs > this.watcherStaleAfterMs) {
      return { status: 'fail', reason: 'stale', ageSeconds };
    }
    return { status: 'ok', ageSeconds };
  }
}
