export interface AuditLogEntryInput {
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/** What actually gets stored: the caller's fields plus where the request
 * came from, which `RecordAuditLogEntry` fills in rather than the caller. */
export interface AuditLogEntryRecord extends AuditLogEntryInput {
  ipAddress: string | null;
  /** Kept raw. Browser and OS are derived for display, so a parser that
   * gets better later can re-read old entries. */
  userAgent: string | null;
}

export interface AuditLogEntry extends AuditLogEntryRecord {
  id: string;
  createdAt: Date;
}

export interface AuditLogRepository {
  record(entry: AuditLogEntryRecord): Promise<void>;
  list(params?: { limit?: number; offset?: number }): Promise<AuditLogEntry[]>;
  count(): Promise<number>;
}
