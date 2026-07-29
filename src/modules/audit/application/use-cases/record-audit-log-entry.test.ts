import { describe, expect, it } from 'vitest';

import { RecordAuditLogEntry } from './record-audit-log-entry';
import type {
  AuditLogEntryRecord,
  AuditLogRepository,
} from '@/modules/audit/application/ports/audit-log-repository';
import type {
  RequestContextProvider,
  RequestOrigin,
} from '@/modules/audit/application/ports/request-context';

function makeFakeRepo() {
  const recorded: AuditLogEntryRecord[] = [];
  const repo: Partial<AuditLogRepository> = {
    async record(entry) {
      recorded.push(entry);
    },
  };
  return { repo: repo as AuditLogRepository, recorded };
}

function makeFakeContext(origin: RequestOrigin): RequestContextProvider {
  return { async current() { return origin; } };
}

const ENTRY = {
  actorUserId: 'user-1',
  actorEmail: 'admin@example.com',
  action: 'order.refunded',
  targetType: 'order',
  targetId: 'order-1',
};

describe('RecordAuditLogEntry', () => {
  // The caller never passes these. Twenty-odd call sites would each have to
  // remember them, and the one that forgets writes an entry that answers
  // none of the questions an audit log exists for.
  it('stamps every entry with where the request came from', async () => {
    const { repo, recorded } = makeFakeRepo();
    const context = makeFakeContext({
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/126',
    });

    await new RecordAuditLogEntry(repo, context).execute(ENTRY);

    expect(recorded).toEqual([
      { ...ENTRY, ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/126' },
    ]);
  });

  // A script or the worker has no request. An entry with no origin still
  // beats no entry.
  it('records the action even when there is no request to read', async () => {
    const { repo, recorded } = makeFakeRepo();
    const context = makeFakeContext({ ipAddress: null, userAgent: null });

    await new RecordAuditLogEntry(repo, context).execute(ENTRY);

    expect(recorded[0]).toMatchObject({ action: 'order.refunded', ipAddress: null, userAgent: null });
  });
});
