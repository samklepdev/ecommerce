import { describe, expect, it } from 'vitest';

import { LogIn } from './log-in';
import { User } from '@/modules/identity/domain/user';
import { Session } from '@/modules/identity/domain/session';
import { hashPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { SessionStore } from '@/modules/identity/application/ports/session-store';

function makeFakeUsers(user: User | null) {
  const repo: UserRepository = {
    async findByEmail() {
      return user;
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
  };
  return repo;
}

function makeFakeSessions() {
  const created: { userId: string; ttlSeconds: number }[] = [];
  const store: SessionStore = {
    async create(userId, ttlSeconds) {
      created.push({ userId, ttlSeconds });
      return Session.create({ id: 'session-1', userId, expiresAt: new Date(Date.now() + ttlSeconds * 1000) });
    },
    async get() {
      return null;
    },
    async destroy() {},
  };
  return { store, created };
}

describe('LogIn', () => {
  it('creates a session on valid credentials', async () => {
    const passwordHash = await hashPassword('correct-horse');
    const user = User.create({ id: 'user-1', email: 'a@example.com', passwordHash });
    const users = makeFakeUsers(user);
    const { store: sessions, created } = makeFakeSessions();

    const result = await new LogIn(users, sessions).execute({
      email: 'a@example.com',
      password: 'correct-horse',
      sessionTtlSeconds: 3600,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.userId).toBe('user-1');
    expect(created).toEqual([{ userId: 'user-1', ttlSeconds: 3600 }]);
  });

  it('returns invalid_credentials for a nonexistent email (no info leak vs wrong password)', async () => {
    const users = makeFakeUsers(null);
    const { store: sessions, created } = makeFakeSessions();

    const result = await new LogIn(users, sessions).execute({
      email: 'nobody@example.com',
      password: 'whatever',
      sessionTtlSeconds: 3600,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_credentials');
    expect(created).toHaveLength(0);
  });

  it('returns the same invalid_credentials error for a wrong password', async () => {
    const passwordHash = await hashPassword('correct-horse');
    const user = User.create({ id: 'user-1', email: 'a@example.com', passwordHash });
    const users = makeFakeUsers(user);
    const { store: sessions, created } = makeFakeSessions();

    const result = await new LogIn(users, sessions).execute({
      email: 'a@example.com',
      password: 'wrong-password',
      sessionTtlSeconds: 3600,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_credentials');
    expect(created).toHaveLength(0);
  });
});
