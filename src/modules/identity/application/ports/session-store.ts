import type { Session } from '@/modules/identity/domain/session';

export interface CreateSessionOptions {
  /** Hard ceiling in seconds. */
  ttlSeconds: number;
  /** How long it may sit unused. Shorter for admins — see `Session`. */
  idleTimeoutSeconds: number;
}

export interface SessionStore {
  create(userId: string, options: CreateSessionOptions): Promise<Session>;
  /**
   * Returns the session only if both its clocks still allow it, and marks it
   * seen. A session that has gone idle is destroyed here rather than merely
   * hidden: leaving a dead record around means the next read has to make the
   * same judgement again, and one of them will eventually get it wrong.
   */
  get(sessionId: string): Promise<Session | null>;
  destroy(sessionId: string): Promise<void>;
  /** Stamps "the password was just typed", for sudo-mode admin actions. */
  markReauthenticated(sessionId: string): Promise<void>;
}
