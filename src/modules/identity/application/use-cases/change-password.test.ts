import { describe, expect, it } from 'vitest';

import { ChangePassword } from './change-password';
import { User } from '@/modules/identity/domain/user';
import { hashPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

function makeFakeUsers(user: User | null) {
  const updatedHashes: { userId: string; passwordHash: string }[] = [];
  const repo: UserRepository = {
    async findByEmail() {
      return null;
    },
    async findById() {
      return user;
    },
    async create() {},
    async updatePasswordHash(userId, passwordHash) {
      updatedHashes.push({ userId, passwordHash });
    },
    async updateAvatarUrl() {},
    async updateRole() {},
    async findProfileById() {
      return null;
    },
    async updateEmail() {},
    async markEmailVerified() {},
    async delete() {},
  };
  return { repo, updatedHashes };
}

describe('ChangePassword', () => {
  it('hashes and updates the new password when the current password is correct', async () => {
    const currentHash = await hashPassword('correct-horse');
    const user = User.create({ id: 'user-1', email: 'a@example.com', passwordHash: currentHash });
    const { repo, updatedHashes } = makeFakeUsers(user);

    const result = await new ChangePassword(repo).execute({
      userId: 'user-1',
      currentPassword: 'correct-horse',
      newPassword: 'battery-staple',
    });

    expect(result.ok).toBe(true);
    expect(updatedHashes).toHaveLength(1);
    expect(updatedHashes[0]?.userId).toBe('user-1');
    expect(updatedHashes[0]?.passwordHash).not.toBe('battery-staple'); // must be hashed
  });

  it('returns invalid_current_password when the current password is wrong', async () => {
    const currentHash = await hashPassword('correct-horse');
    const user = User.create({ id: 'user-1', email: 'a@example.com', passwordHash: currentHash });
    const { repo, updatedHashes } = makeFakeUsers(user);

    const result = await new ChangePassword(repo).execute({
      userId: 'user-1',
      currentPassword: 'wrong-password',
      newPassword: 'battery-staple',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_current_password');
    expect(updatedHashes).toHaveLength(0);
  });

  it('returns user_not_found when there is no such user', async () => {
    const { repo, updatedHashes } = makeFakeUsers(null);

    const result = await new ChangePassword(repo).execute({
      userId: 'missing',
      currentPassword: 'whatever',
      newPassword: 'battery-staple',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('user_not_found');
    expect(updatedHashes).toHaveLength(0);
  });
});
