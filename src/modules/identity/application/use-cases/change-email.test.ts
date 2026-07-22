import { describe, expect, it } from 'vitest';

import { ChangeEmail } from './change-email';
import { User } from '@/modules/identity/domain/user';
import { hashPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

async function makeUser(id: string, email: string, password: string) {
  return User.create({ id, email, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() });
}

function makeFakeUsers(usersById: Map<string, User>) {
  const updatedEmails: { userId: string; email: string }[] = [];
  const repo: UserRepository = {
    async findByEmail(email) {
      for (const u of usersById.values()) {
        if (u.email === email.toLowerCase()) return u;
      }
      return null;
    },
    async findById(id) {
      return usersById.get(id) ?? null;
    },
    async create() {},
    async updatePasswordHash() {},
    async updateAvatarUrl() {},
    async updateRole() {},
    async findProfileById() {
      return null;
    },
    async updateEmail(userId, email) {
      updatedEmails.push({ userId, email });
    },
    async markEmailVerified() {},
    async delete() {},
  };
  return { repo, updatedEmails };
}

describe('ChangeEmail', () => {
  it('changes the email when the password is correct and the new email is free', async () => {
    const user = await makeUser('user-1', 'old@example.com', 'password123');
    const { repo, updatedEmails } = makeFakeUsers(new Map([['user-1', user]]));

    const result = await new ChangeEmail(repo).execute({
      userId: 'user-1',
      newEmail: 'new@example.com',
      currentPassword: 'password123',
    });

    expect(result.ok).toBe(true);
    expect(updatedEmails).toEqual([{ userId: 'user-1', email: 'new@example.com' }]);
  });

  it('rejects an incorrect current password', async () => {
    const user = await makeUser('user-1', 'old@example.com', 'password123');
    const { repo, updatedEmails } = makeFakeUsers(new Map([['user-1', user]]));

    const result = await new ChangeEmail(repo).execute({
      userId: 'user-1',
      newEmail: 'new@example.com',
      currentPassword: 'wrong-password',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_current_password');
    expect(updatedEmails).toHaveLength(0);
  });

  it('rejects an email already in use by another account', async () => {
    const user = await makeUser('user-1', 'old@example.com', 'password123');
    const other = await makeUser('user-2', 'taken@example.com', 'irrelevant');
    const { repo, updatedEmails } = makeFakeUsers(
      new Map([
        ['user-1', user],
        ['user-2', other],
      ]),
    );

    const result = await new ChangeEmail(repo).execute({
      userId: 'user-1',
      newEmail: 'taken@example.com',
      currentPassword: 'password123',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('email_taken');
    expect(updatedEmails).toHaveLength(0);
  });
});
