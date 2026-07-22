export interface AuditLogEntryInput {
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry extends AuditLogEntryInput {
  id: string;
  createdAt: Date;
}

export interface AuditLogRepository {
  record(entry: AuditLogEntryInput): Promise<void>;
  list(params?: { limit?: number; offset?: number }): Promise<AuditLogEntry[]>;
  count(): Promise<number>;
}
