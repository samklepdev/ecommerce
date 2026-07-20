import { describe, expect, it } from 'vitest';

import { ResetPassword } from './reset-password';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type {
  PasswordResetRepository,
  PasswordResetTokenRecord,
} from '@/modules/identity/application/ports/password-reset-repository';

function makeFakeUsers() {
  const passwordHashByUserId = new Map<string, string>();
  const users: UserRepository = {
    async findByEmail() {
      return null;
    },
    async findById() {
      return null;
    },
    async create() {},
    async updatePasswordHash(userId, passwordHash) {
      passwordHashByUserId.set(userId, passwordHash);
    },
    async updateAvatarUrl() {},
    async updateRole() {},
    async findProfileById() {
      return null;
    },
  };
  return { users, passwordHashByUserId };
}

function makeFakePasswordResets(validRecord: PasswordResetTokenRecord | null) {
  const markedUsed: string[] = [];
  const repo: PasswordResetRepository = {
    async create() {},
    async findValidByToken() {
      return validRecord;
    },
    async markUsed(id) {
      if (markedUsed.includes(id)) return false; // guarded/idempotent
      markedUsed.push(id);
      return true;
    },
    async invalidateAllForUser() {},
  };
  return { repo, markedUsed };
}

describe('ResetPassword', () => {
  it('hashes the new password, updates it, and marks the token used on a valid token', async () => {
    const { users, passwordHashByUserId } = makeFakeUsers();
    const { repo: passwordResets, markedUsed } = makeFakePasswordResets({
      id: 'token-1',
      userId: 'user-1',
    });

    const useCase = new ResetPassword(users, passwordResets);
    const result = await useCase.execute({ token: 'raw-token', newPassword: 'newpassword123' });

    expect(result.ok).toBe(true);
    expect(passwordHashByUserId.get('user-1')).toBeDefined();
    expect(passwordHashByUserId.get('user-1')).not.toBe('newpassword123'); // must be hashed
    expect(markedUsed).toEqual(['token-1']);
  });

  it('returns invalid_or_expired_token when the token is not found/expired/already used', async () => {
    const { users } = makeFakeUsers();
    const { repo: passwordResets } = makeFakePasswordResets(null);

    const useCase = new ResetPassword(users, passwordResets);
    const result = await useCase.execute({ token: 'bad-token', newPassword: 'newpassword123' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_or_expired_token');
  });
});
