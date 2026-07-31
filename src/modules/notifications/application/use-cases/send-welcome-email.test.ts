import { describe, expect, it } from 'vitest';

import { SendWelcomeEmail } from './send-welcome-email';
import type {
  CreateWelcomeEmailInput,
  WelcomeEmailRepository,
  WelcomeEmailStatus,
} from '@/modules/notifications/application/ports/welcome-email-repository';
import type { EmailMessage, EmailSender } from '@/modules/notifications/application/ports/email-sender';

function makeFakeWelcomeEmails(existing: WelcomeEmailStatus | null) {
  const created: CreateWelcomeEmailInput[] = [];
  const repo: WelcomeEmailRepository = {
    async create(input) {
      created.push(input);
    },
    async findByUserId() {
      return existing;
    },
    async markOpened() {
      return false;
    },
  };
  return { repo, created };
}

function makeFakeEmailSender() {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    async send(message) {
      sent.push(message);
    },
  };
  return { sender, sent };
}

describe('SendWelcomeEmail', () => {
  it('sends the email with a tracking link and persists the record', async () => {
    const { repo, created } = makeFakeWelcomeEmails(null);
    const { sender, sent } = makeFakeEmailSender();

    await new SendWelcomeEmail(repo, sender, 'https://shop.example.com').execute({
      userId: 'user-1',
      email: 'buyer@example.com',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('buyer@example.com');
    expect(sent[0]?.html).toContain('https://shop.example.com/api/email/track/');
    // The text alternative goes out too, and carries the address rather than
    // the pixel — a text part can't have one, which is fine: an unopened
    // welcome email is not a business event worth breaking rendering for.
    expect(sent[0]?.text).toContain('buyer@example.com');
    expect(created).toHaveLength(1);
    expect(created[0]?.userId).toBe('user-1');
  });

  it('is idempotent — does nothing if the user already has a welcome email on record', async () => {
    const { repo, created } = makeFakeWelcomeEmails({ sentAt: new Date(), openedAt: null });
    const { sender, sent } = makeFakeEmailSender();

    await new SendWelcomeEmail(repo, sender, 'https://shop.example.com').execute({
      userId: 'user-1',
      email: 'buyer@example.com',
    });

    expect(sent).toHaveLength(0);
    expect(created).toHaveLength(0);
  });
});
