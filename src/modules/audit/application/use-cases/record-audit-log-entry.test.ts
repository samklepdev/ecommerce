import { describe, expect, it } from 'vitest';

import { RecordAuditLogEntry } from './record-audit-log-entry';
import type { AuditLogEntryInput, AuditLogRepository } from '@/modules/audit/application/ports/audit-log-repository';

function makeFakeRepo() {
  const recorded: AuditLogEntryInput[] = [];
  const repo: Partial<AuditLogRepository> = {
    async record(entry) {
      recorded.push(entry);
    },
  };
  return { repo: repo as AuditLogRepository, recorded };
}

describe('RecordAuditLogEntry', () => {
  it('delegates to the repository', async () => {
    const { repo, recorded } = makeFakeRepo();

    await new RecordAuditLogEntry(repo).execute({
      actorUserId: 'user-1',
      actorEmail: 'admin@example.com',
      action: 'order.refunded',
      targetType: 'order',
      targetId: 'order-1',
    });

    expect(recorded).toEqual([
      {
        actorUserId: 'user-1',
        actorEmail: 'admin@example.com',
        action: 'order.refunded',
        targetType: 'order',
        targetId: 'order-1',
      },
    ]);
  });
});
