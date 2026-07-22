import type { UseCase } from '@/shared/application/use-case';
import type {
  AuditLogEntry,
  AuditLogRepository,
} from '@/modules/audit/application/ports/audit-log-repository';

export interface ListAuditLogEntriesInput {
  limit?: number;
  offset?: number;
}

export interface ListAuditLogEntriesResult {
  items: AuditLogEntry[];
  total: number;
}

export class ListAuditLogEntries implements UseCase<ListAuditLogEntriesInput, ListAuditLogEntriesResult> {
  constructor(private readonly auditLog: AuditLogRepository) {}

  async execute(input: ListAuditLogEntriesInput): Promise<ListAuditLogEntriesResult> {
    const [items, total] = await Promise.all([
      this.auditLog.list(input),
      this.auditLog.count(),
    ]);
    return { items, total };
  }
}
