import { describe, expect, it } from 'vitest';

import { ListAuditLogEntries } from './list-audit-log-entries';
import type { AuditLogEntry, AuditLogRepository } from '@/modules/audit/application/ports/audit-log-repository';

function makeFakeRepo(entries: AuditLogEntry[], total: number) {
  const listCalls: ({ limit?: number; offset?: number } | undefined)[] = [];
  const repo: Partial<AuditLogRepository> = {
    async list(params) {
      listCalls.push(params);
      return entries;
    },
    async count() {
      return total;
    },
  };
  return { repo: repo as AuditLogRepository, listCalls };
}

describe('ListAuditLogEntries', () => {
  it('returns items and total, forwarding limit/offset to the repository', async () => {
    const { repo, listCalls } = makeFakeRepo([], 42);

    const result = await new ListAuditLogEntries(repo).execute({ limit: 10, offset: 20 });

    expect(result.total).toBe(42);
    expect(listCalls).toEqual([{ limit: 10, offset: 20 }]);
  });
});
