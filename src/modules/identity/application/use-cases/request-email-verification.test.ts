import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { RequestEmailVerification } from './request-email-verification';
import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationRepository,
} from '@/modules/identity/application/ports/email-verification-repository';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';

const TTL_SECONDS = 3600;
const APP_URL = 'https://shop.test';

function makeFakeEmailVerifications() {
  const created: CreateEmailVerificationTokenInput[] = [];
  const invalidatedUserIds: string[] = [];
  const repo: EmailVerificationRepository = {
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
      invalidatedUserIds.push(userId);
    },
  };
  return { repo, created, invalidatedUserIds };
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

describe('RequestEmailVerification', () => {
  it('invalidates prior tokens, creates a new one, and emails a verify link', async () => {
    const { repo: emailVerifications, created, invalidatedUserIds } = makeFakeEmailVerifications();
    const { sender: emailSender, sent } = makeFakeEmailSender();

    await new RequestEmailVerification(emailVerifications, emailSender, APP_URL, TTL_SECONDS).execute({
      userId: 'user-1',
      email: 'a@example.com',
    });

    expect(invalidatedUserIds).toEqual(['user-1']);
    expect(created).toHaveLength(1);
    expect(created[0]?.userId).toBe('user-1');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('a@example.com');
    const match = sent[0]?.html.match(/verify-email\/([a-f0-9]+)/);
    expect(match).not.toBeNull();
    const rawToken = match![1]!;
    expect(created[0]?.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
  });
});
