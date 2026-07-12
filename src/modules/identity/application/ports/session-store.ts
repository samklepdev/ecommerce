import type { Session } from '@/modules/identity/domain/session';

export interface SessionStore {
  create(userId: string, ttlSeconds: number): Promise<Session>;
  get(sessionId: string): Promise<Session | null>;
  destroy(sessionId: string): Promise<void>;
}
