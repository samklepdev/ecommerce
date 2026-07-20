import { describe, expect, it } from 'vitest';

import { GetWelcomeEmailStatus } from './get-welcome-email-status';
import type { WelcomeEmailRepository, WelcomeEmailStatus } from '@/modules/notifications/application/ports/welcome-email-repository';

function makeFakeWelcomeEmails(status: WelcomeEmailStatus | null) {
  const repo: WelcomeEmailRepository = {
    async create() {},
    async findByUserId() {
      return status;
    },
    async markOpened() {
      return false;
    },
  };
  return repo;
}

describe('GetWelcomeEmailStatus', () => {
  it('returns all-false/null defaults when no welcome email was ever sent', async () => {
    const repo = makeFakeWelcomeEmails(null);

    const result = await new GetWelcomeEmailStatus(repo).execute({ userId: 'user-1' });

    expect(result).toEqual({ sent: false, sentAt: null, opened: false, openedAt: null });
  });

  it('reports sent but not opened when sentAt is set and openedAt is null', async () => {
    const sentAt = new Date('2026-01-01T00:00:00Z');
    const repo = makeFakeWelcomeEmails({ sentAt, openedAt: null });

    const result = await new GetWelcomeEmailStatus(repo).execute({ userId: 'user-1' });

    expect(result).toEqual({ sent: true, sentAt, opened: false, openedAt: null });
  });

  it('reports opened when openedAt is set', async () => {
    const sentAt = new Date('2026-01-01T00:00:00Z');
    const openedAt = new Date('2026-01-02T00:00:00Z');
    const repo = makeFakeWelcomeEmails({ sentAt, openedAt });

    const result = await new GetWelcomeEmailStatus(repo).execute({ userId: 'user-1' });

    expect(result).toEqual({ sent: true, sentAt, opened: true, openedAt });
  });
});
