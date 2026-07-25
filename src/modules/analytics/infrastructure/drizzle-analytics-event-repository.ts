import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { analyticsEvents } from '@/shared/infrastructure/db/schema';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
  AnalyticsEventType,
  DailyCount,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export class DrizzleAnalyticsEventRepository implements AnalyticsEventRepository {
  constructor(private readonly db: DB) {}

  async record(event: AnalyticsEventInput): Promise<void> {
    await this.db.insert(analyticsEvents).values({
      id: randomUUID(),
      eventType: event.eventType,
      sessionId: event.sessionId,
      userId: event.userId,
      path: event.path ?? null,
      referrer: event.referrer ?? null,
      userAgent: event.userAgent ?? null,
      ipAddress: event.ipAddress ?? null,
      metadata: event.metadata ?? null,
    });
  }

  async countByTypePerDay(eventType: AnalyticsEventType, since: Date, until: Date): Promise<DailyCount[]> {
    const rows = await this.db
      .select({
        day: sql<string>`to_char(${analyticsEvents.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
  }

  async topValues(
    eventType: AnalyticsEventType,
    field: 'path' | 'referrer',
    since: Date,
    until: Date,
    limit: number,
  ): Promise<ValueCount[]> {
    const column = field === 'path' ? analyticsEvents.path : analyticsEvents.referrer;
    const rows = await this.db
      .select({ value: column, count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          sql`${column} is not null`,
        ),
      )
      .groupBy(column)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    return rows.map((r) => ({ value: r.value ?? '', count: Number(r.count) }));
  }

  async topSearchTerms(since: Date, until: Date, limit: number): Promise<ValueCount[]> {
    const term = sql<string>`${analyticsEvents.metadata}->>'term'`;
    const rows = await this.db
      .select({ value: term, count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'search'),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          sql`${analyticsEvents.metadata}->>'term' is not null`,
        ),
      )
      .groupBy(term)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
  }
}
