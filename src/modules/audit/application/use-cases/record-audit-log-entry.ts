import type { UseCase } from '@/shared/application/use-case';
import type {
  AuditLogEntryInput,
  AuditLogRepository,
} from '@/modules/audit/application/ports/audit-log-repository';
import type { RequestContextProvider } from '@/modules/audit/application/ports/request-context';

/**
 * Records what an admin did, and where from.
 *
 * The origin is resolved here rather than passed in. Every call site would
 * otherwise have to remember two more arguments, and the one that forgets
 * writes an entry that looks the same but answers none of the questions an
 * audit log exists to answer.
 */
export class RecordAuditLogEntry implements UseCase<AuditLogEntryInput, void> {
  constructor(
    private readonly auditLog: AuditLogRepository,
    private readonly requestContext: RequestContextProvider,
  ) {}

  async execute(input: AuditLogEntryInput): Promise<void> {
    const origin = await this.requestContext.current();
    await this.auditLog.record({ ...input, ...origin });
  }
}
