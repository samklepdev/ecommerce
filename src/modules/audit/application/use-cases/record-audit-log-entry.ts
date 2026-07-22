import type { UseCase } from '@/shared/application/use-case';
import type {
  AuditLogEntryInput,
  AuditLogRepository,
} from '@/modules/audit/application/ports/audit-log-repository';

export class RecordAuditLogEntry implements UseCase<AuditLogEntryInput, void> {
  constructor(private readonly auditLog: AuditLogRepository) {}

  async execute(input: AuditLogEntryInput): Promise<void> {
    await this.auditLog.record(input);
  }
}
