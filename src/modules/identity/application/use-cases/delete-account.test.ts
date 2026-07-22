import { describe, expect, it } from 'vitest';

import { DeleteAccount } from './delete-account';
import { User } from '@/modules/identity/domain/user';
import { hashPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

function makeFakeUsers(user: User | null) {
  const deletedUserIds: string[] = [];
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
    async delete(userId) {
      deletedUserIds.push(userId);
    },
  };
  return { repo, deletedUserIds };
}

describe('DeleteAccount', () => {
  it('deletes the account when the password is correct', async () => {
    const user = User.create({
      id: 'user-1',
      email: 'a@example.com',
      passwordHash: await hashPassword('password123'),
    });
    const { repo, deletedUserIds } = makeFakeUsers(user);

    const result = await new DeleteAccount(repo).execute({
      userId: 'user-1',
      currentPassword: 'password123',
    });

    expect(result.ok).toBe(true);
    expect(deletedUserIds).toEqual(['user-1']);
  });

  it('rejects an incorrect password and does not delete', async () => {
    const user = User.create({
      id: 'user-1',
      email: 'a@example.com',
      passwordHash: await hashPassword('password123'),
    });
    const { repo, deletedUserIds } = makeFakeUsers(user);

    const result = await new DeleteAccount(repo).execute({
      userId: 'user-1',
      currentPassword: 'wrong',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_current_password');
    expect(deletedUserIds).toHaveLength(0);
  });
});
