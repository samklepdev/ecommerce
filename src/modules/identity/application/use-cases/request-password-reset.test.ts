import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { RequestPasswordReset } from './request-password-reset';
import { User } from '@/modules/identity/domain/user';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type {
  CreatePasswordResetTokenInput,
  PasswordResetRepository,
} from '@/modules/identity/application/ports/password-reset-repository';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';

const TTL_SECONDS = 3600;
const APP_URL = 'https://shop.test';

function makeFakeUsers(existing?: User): UserRepository {
  return {
    async findByEmail(email) {
      return existing && existing.email === email.toLowerCase() ? existing : null;
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
    async markEmailVerified() {},
    async delete() {},
  };
}

function makeFakePasswordResets() {
  const created: CreatePasswordResetTokenInput[] = [];
  const invalidatedForUser: string[] = [];
  const repo: PasswordResetRepository = {
    async create(input) {
      created.push(input);
    },
    async findValidByToken() {
      return null;
    },
    async markUsed() {
      return true;
    },
    async invalidateAllForUser(userId) {
      invalidatedForUser.push(userId);
    },
  };
  return { repo, created, invalidatedForUser };
}

function makeFakeEmailSender() {
  const sent: { to: string; subject: string; html: string }[] = [];
  const sender: EmailSender = {
    async send(to, subject, html) {
      sent.push({ to, subject, html });
    },
  };
  return { sender, sent };
}

describe('RequestPasswordReset', () => {
  it('creates a hashed token, invalidates prior tokens, and emails a reset link when the user exists', async () => {
    const user = User.create({ id: 'user-1', email: 'test@example.com', passwordHash: 'hash' });
    const users = makeFakeUsers(user);
    const { repo: passwordResets, created, invalidatedForUser } = makeFakePasswordResets();
    const { sender, sent } = makeFakeEmailSender();

    const useCase = new RequestPasswordReset(users, passwordResets, sender, APP_URL, TTL_SECONDS);
    await useCase.execute({ email: 'test@example.com' });

    expect(invalidatedForUser).toEqual(['user-1']);
    expect(created).toHaveLength(1);
    expect(created[0]?.userId).toBe('user-1');
    // The stored hash must not be the raw token, and must be a real sha256 of it.
    expect(sent).toHaveLength(1);
    const { to, html } = sent[0]!;
    expect(to).toBe('test@example.com');
    const urlMatch = html.match(new RegExp(`${APP_URL}/reset-password/([a-f0-9]+)`));
    expect(urlMatch).not.toBeNull();
    const rawToken = urlMatch![1]!;
    expect(rawToken).toHaveLength(64); // 32 bytes hex-encoded
    expect(created[0]?.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(created[0]?.tokenHash).not.toBe(rawToken);
  });

  it('does nothing observable when the email does not exist (no account-enumeration leak)', async () => {
    const users = makeFakeUsers(undefined);
    const { repo: passwordResets, created, invalidatedForUser } = makeFakePasswordResets();
    const { sender, sent } = makeFakeEmailSender();

    const useCase = new RequestPasswordReset(users, passwordResets, sender, APP_URL, TTL_SECONDS);
    await useCase.execute({ email: 'nobody@example.com' });

    expect(created).toHaveLength(0);
    expect(invalidatedForUser).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
