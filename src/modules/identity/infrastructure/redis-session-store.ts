import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

import { Session } from '@/modules/identity/domain/session';
import type {
  CreateSessionOptions,
  SessionStore,
} from '@/modules/identity/application/ports/session-store';

interface StoredSession {
  userId: string;
  expiresAt: string;
  lastSeenAt: string;
  idleTimeoutSeconds: number;
  reauthenticatedAt: string;
}

/**
 * How stale `lastSeenAt` may get before a read bothers to write it back.
 *
 * Without this, every request on every page writes to Redis — which is
 * already on the path of carts, rate limiting and the BTC address counter.
 * The cost is that a session can outlive its idle window by up to this much,
 * which at a minute against windows measured in hours doesn't change what
 * the timeout means.
 */
const TOUCH_THROTTLE_SECONDS = 60;

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'session:',
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(userId: string, options: CreateSessionOptions): Promise<Session> {
    const id = randomUUID();
    const now = this.now();
    const session = Session.create({
      id,
      userId,
      expiresAt: new Date(now.getTime() + options.ttlSeconds * 1000),
      lastSeenAt: now,
      idleTimeoutSeconds: options.idleTimeoutSeconds,
      // Logging in *is* typing the password, so sudo mode starts here.
      reauthenticatedAt: now,
    });

    await this.write(session, now);
    return session;
  }

  async get(sessionId: string): Promise<Session | null> {
    const raw = await this.redis.get(this.key(sessionId));
    if (!raw) return null;

    const session = this.parse(sessionId, raw);
    if (!session) {
      // Unreadable means unusable. Dropped rather than left to rot, so a
      // malformed record isn't re-read on every request forever.
      await this.destroy(sessionId);
      return null;
    }

    const now = this.now();
    if (!session.isValidAt(now)) {
      await this.destroy(sessionId);
      return null;
    }

    // Sliding window: activity pushes the idle deadline out, capped by the
    // absolute one.
    if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_THROTTLE_SECONDS * 1000) {
      const touched = Session.create({
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        lastSeenAt: now,
        idleTimeoutSeconds: session.idleTimeoutSeconds,
        reauthenticatedAt: session.reauthenticatedAt,
      });
      await this.write(touched, now);
      return touched;
    }

    return session;
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  async markReauthenticated(sessionId: string): Promise<void> {
    const raw = await this.redis.get(this.key(sessionId));
    if (!raw) return;

    const session = this.parse(sessionId, raw);
    if (!session) return;

    const now = this.now();
    await this.write(
      Session.create({
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        lastSeenAt: now,
        idleTimeoutSeconds: session.idleTimeoutSeconds,
        reauthenticatedAt: now,
      }),
      now,
    );
  }

  /**
   * Persists with a TTL of whichever clock runs out first.
   *
   * Letting Redis expire the key is what makes the idle timeout real rather
   * than advisory: an idle session disappears on its own, even if nothing
   * ever reads it again to notice.
   */
  private async write(session: Session, now: Date): Promise<void> {
    const ttl = Math.min(session.idleTimeoutSeconds, session.secondsUntilExpiry(now));
    if (ttl <= 0) {
      await this.destroy(session.id);
      return;
    }

    const stored: StoredSession = {
      userId: session.userId,
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      idleTimeoutSeconds: session.idleTimeoutSeconds,
      reauthenticatedAt: session.reauthenticatedAt.toISOString(),
    };
    await this.redis.set(this.key(session.id), JSON.stringify(stored), 'EX', ttl);
  }

  /**
   * Tolerates records written before the idle clock existed: they keep the
   * absolute expiry they were created with, and start their idle window now.
   * The alternative is signing everyone out on deploy.
   */
  private parse(sessionId: string, raw: string): Session | null {
    let parsed: Partial<StoredSession>;
    try {
      parsed = JSON.parse(raw) as Partial<StoredSession>;
    } catch {
      return null;
    }

    if (typeof parsed.userId !== 'string' || typeof parsed.expiresAt !== 'string') return null;

    const expiresAt = new Date(parsed.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) return null;

    const now = this.now();
    return Session.create({
      id: sessionId,
      userId: parsed.userId,
      expiresAt,
      lastSeenAt: parsed.lastSeenAt ? new Date(parsed.lastSeenAt) : now,
      idleTimeoutSeconds:
        typeof parsed.idleTimeoutSeconds === 'number'
          ? parsed.idleTimeoutSeconds
          : Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
      reauthenticatedAt: parsed.reauthenticatedAt ? new Date(parsed.reauthenticatedAt) : now,
    });
  }

  private key(sessionId: string): string {
    return this.prefix + sessionId;
  }
}
