import { randomUUID } from 'node:crypto';
import { count as countRows, desc } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { auditLog } from '@/shared/infrastructure/db/schema';
import type {
  AuditLogEntry,
  AuditLogEntryRecord,
  AuditLogRepository,
} from '@/modules/audit/application/ports/audit-log-repository';

type Row = typeof auditLog.$inferSelect;

function toEntry(row: Row): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DB) {}

  async record(entry: AuditLogEntryRecord): Promise<void> {
    await this.db.insert(auditLog).values({
      id: randomUUID(),
      actorUserId: entry.actorUserId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    });
  }

  async list(params?: { limit?: number; offset?: number }): Promise<AuditLogEntry[]> {
    const rows = await this.db.query.auditLog.findMany({
      orderBy: [desc(auditLog.createdAt)],
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
    });
    return rows.map(toEntry);
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ value: countRows() }).from(auditLog);
    return row?.value ?? 0;
  }
}
