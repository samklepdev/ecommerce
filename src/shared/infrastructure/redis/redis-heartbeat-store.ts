import type Redis from 'ioredis';

import type { HeartbeatStore, ServiceProbe } from '@/shared/application/ports/health-ports';

/** Long enough that a stopped process still reads as "last seen a while
 * ago" rather than vanishing into "never reported", which would hide how
 * long it has been down. */
const HEARTBEAT_TTL_SECONDS = 60 * 60 * 24;

function keyFor(name: string): string {
  return `heartbeat:${name}`;
}

export class RedisHeartbeatStore implements HeartbeatStore, ServiceProbe {
  constructor(private readonly redis: Redis) {}

  async record(name: string, at: Date): Promise<void> {
    await this.redis.set(keyFor(name), at.toISOString(), 'EX', HEARTBEAT_TTL_SECONDS);
  }

  async lastSeen(name: string): Promise<Date | null> {
    const raw = await this.redis.get(keyFor(name));
    if (!raw) return null;
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? null : at;
  }

  /** Doubles as the Redis liveness probe for `/api/health` — the round trip
   * is the check. */
  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
