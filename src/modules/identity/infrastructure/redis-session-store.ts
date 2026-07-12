import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

import { Session } from '@/modules/identity/domain/session';
import type { SessionStore } from '@/modules/identity/application/ports/session-store';

interface StoredSession {
  userId: string;
  expiresAt: string;
}

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'session:',
  ) {}

  async create(userId: string, ttlSeconds: number): Promise<Session> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const stored: StoredSession = { userId, expiresAt: expiresAt.toISOString() };
    await this.redis.set(this.prefix + id, JSON.stringify(stored), 'EX', ttlSeconds);
    return Session.create({ id, userId, expiresAt });
  }

  async get(sessionId: string): Promise<Session | null> {
    const raw = await this.redis.get(this.prefix + sessionId);
    if (!raw) return null;
    const { userId, expiresAt } = JSON.parse(raw) as StoredSession;
    return Session.create({ id: sessionId, userId, expiresAt: new Date(expiresAt) });
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis.del(this.prefix + sessionId);
  }
}
