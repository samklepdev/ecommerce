import { describe, expect, it } from 'vitest';

import { GetCurrentUser } from './get-current-user';
import { User } from '@/modules/identity/domain/user';
import { Session } from '@/modules/identity/domain/session';
import type { SessionStore } from '@/modules/identity/application/ports/session-store';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

function makeFakeSessions(session: Session | null) {
  const store: SessionStore = {
    async create() {
      throw new Error('not used');
    },
    async get() {
      return session;
    },
    async destroy() {},
    async markReauthenticated() {},
  };
  return store;
}

function makeFakeUsers(user: User | null) {
  const repo: UserRepository = {
    async findByEmail() {
      return null;
    },
    async findById() {
      return user;
    },
    async create() {},
    async updatePasswordHash() {},
    async updateAvatarUrl() {},
    async updateRole() {},
    async findProfileById() {
      return null;
    },
    async updateEmail() {},
    async markEmailVerified() {},
    async delete() {},
  };
  return repo;
}

describe('GetCurrentUser', () => {
  it('returns null when sessionId is null', async () => {
    const sessions = makeFakeSessions(null);
    const users = makeFakeUsers(null);

    const result = await new GetCurrentUser(sessions, users).execute({ sessionId: null });

    expect(result).toBeNull();
  });

  it('returns null when the session does not exist', async () => {
    const sessions = makeFakeSessions(null);
    const users = makeFakeUsers(null);

    const result = await new GetCurrentUser(sessions, users).execute({ sessionId: 'missing' });

    expect(result).toBeNull();
  });

  it('returns null when the session is expired', async () => {
    const expiredSession = Session.create({
      id: 'session-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000), lastSeenAt: new Date(), idleTimeoutSeconds: 3600, reauthenticatedAt: new Date() });
    const sessions = makeFakeSessions(expiredSession);
    const users = makeFakeUsers(User.create({ id: 'user-1', email: 'a@example.com', passwordHash: 'hash' }));

    const result = await new GetCurrentUser(sessions, users).execute({ sessionId: 'session-1' });

    expect(result).toBeNull();
  });

  it('returns the user for a valid, unexpired session', async () => {
    const validSession = Session.create({
      id: 'session-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date(), idleTimeoutSeconds: 3600, reauthenticatedAt: new Date() });
    const user = User.create({ id: 'user-1', email: 'a@example.com', passwordHash: 'hash' });
    const sessions = makeFakeSessions(validSession);
    const users = makeFakeUsers(user);

    const result = await new GetCurrentUser(sessions, users).execute({ sessionId: 'session-1' });

    expect(result).toBe(user);
  });
});
