import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { VerifyEmail } from './verify-email';
import type { EmailVerificationRepository } from '@/modules/identity/application/ports/email-verification-repository';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function makeFakeEmailVerifications(record: { id: string; userId: string } | null) {
  const markedUsedIds: string[] = [];
  const repo: EmailVerificationRepository = {
    async create() {},
    async findValidByToken() {
      return record;
    },
    async markUsed(id) {
      markedUsedIds.push(id);
      return true;
    },
    async invalidateAllForUser() {},
  };
  return { repo, markedUsedIds };
}

function makeFakeUsers() {
  const verifiedUserIds: string[] = [];
  const repo: UserRepository = {
    async findByEmail() {
      return null;
    },
    async findById() {
      return null;
    },
    async create() {},
    async updatePasswordHash() {},
    async updateAvatarUrl() {},
    async updateRole() {},
    async findProfileById() {
      return null;
    },
    async updateEmail() {},
    async markEmailVerified(userId) {
      verifiedUserIds.push(userId);
    },
    async delete() {},
  };
  return { repo, verifiedUserIds };
}

describe('VerifyEmail', () => {
  it('marks the user verified and consumes the token on a valid token', async () => {
    const rawToken = 'a'.repeat(64);
    const { repo: emailVerifications, markedUsedIds } = makeFakeEmailVerifications({
      id: 'token-1',
      userId: 'user-1',
    });
    const { repo: users, verifiedUserIds } = makeFakeUsers();

    const result = await new VerifyEmail(users, emailVerifications).execute({ token: rawToken });

    expect(result.ok).toBe(true);
    expect(verifiedUserIds).toEqual(['user-1']);
    expect(markedUsedIds).toEqual(['token-1']);
  });

  it('returns invalid_or_expired for an unknown/expired/used token', async () => {
    const { repo: emailVerifications } = makeFakeEmailVerifications(null);
    const { repo: users, verifiedUserIds } = makeFakeUsers();

    const result = await new VerifyEmail(users, emailVerifications).execute({ token: 'nope' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_or_expired_token');
    expect(verifiedUserIds).toHaveLength(0);
  });

  it('hashes the raw token before looking it up', async () => {
    const rawToken = 'my-raw-token';
    let seenHash: string | null = null;
    const repo: EmailVerificationRepository = {
      async create() {},
      async findValidByToken(tokenHash) {
        seenHash = tokenHash;
        return null;
      },
      async markUsed() {
        return true;
      },
      async invalidateAllForUser() {},
    };
    const { repo: users } = makeFakeUsers();

    await new VerifyEmail(users, repo).execute({ token: rawToken });

    expect(seenHash).toBe(hashToken(rawToken));
  });
});
