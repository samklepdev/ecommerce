import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, ilike, isNotNull, lte, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { analyticsEvents } from '@/shared/infrastructure/db/schema';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
  AnalyticsEventRow,
  CityViews,
  CountryViews,
  PathDwell,
  RegionViews,
  AnalyticsEventType,
  DailyCount,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

function toRow(r: typeof analyticsEvents.$inferSelect): AnalyticsEventRow {
  return {
    id: r.id,
    eventType: r.eventType as AnalyticsEventType,
    sessionId: r.sessionId,
    userId: r.userId,
    path: r.path,
    referrer: r.referrer,
    userAgent: r.userAgent,
    ipAddress: r.ipAddress,
    metadata: r.metadata as Record<string, unknown> | null,
    createdAt: r.createdAt,
  };
}

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

  async listByType(
    eventType: AnalyticsEventType,
    since: Date,
    until: Date,
    limit: number,
    offset: number,
    pathContains?: string,
  ): Promise<{ items: AnalyticsEventRow[]; total: number }> {
    // A blank filter is the same as no filter — an empty `ILIKE '%%'` would
    // still exclude rows with a null path, silently dropping data.
    const trimmedPath = pathContains?.trim();
    const whereClause = and(
      eq(analyticsEvents.eventType, eventType),
      gte(analyticsEvents.createdAt, since),
      lte(analyticsEvents.createdAt, until),
      trimmedPath ? ilike(analyticsEvents.path, `%${trimmedPath}%`) : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(analyticsEvents)
        .where(whereClause)
        .orderBy(desc(analyticsEvents.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(whereClause),
    ]);

    return { items: rows.map(toRow), total: Number(countRows[0]?.count ?? 0) };
  }

  async viewsByCountry(since: Date, until: Date, limit: number): Promise<CountryViews[]> {
    const country = sql<string>`${analyticsEvents.metadata} ->> 'country'`;
    const countryCode = sql<string>`${analyticsEvents.metadata} ->> 'countryCode'`;
    const continent = sql<string>`${analyticsEvents.metadata} ->> 'continent'`;

    const rows = await this.db
      .select({
        country,
        countryCode,
        continent,
        views: sql<number>`count(*)`,
        // max() rather than a random pick so the sample is stable between
        // reloads — a value that changes every refresh reads as a bug.
        sampleIp: sql<string | null>`max(${analyticsEvents.ipAddress})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'page_view'),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          sql`${analyticsEvents.metadata} ->> 'country' IS NOT NULL`,
        ),
      )
      .groupBy(country, countryCode, continent)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    return rows.map((r) => ({
      country: r.country,
      countryCode: r.countryCode,
      continent: r.continent,
      views: Number(r.views),
      sampleIp: r.sampleIp,
    }));
  }

  async viewsByRegion(since: Date, until: Date, limit: number): Promise<RegionViews[]> {
    const region = sql<string>`${analyticsEvents.metadata} ->> 'region'`;
    const country = sql<string>`${analyticsEvents.metadata} ->> 'country'`;

    const rows = await this.db
      .select({
        region,
        country,
        views: sql<number>`count(*)`,
        // The most frequent city in the region, not an arbitrary one — mode()
        // is exactly this and keeps the value stable between reloads.
        topCity: sql<
          string | null
        >`mode() within group (order by ${analyticsEvents.metadata} ->> 'city')`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'page_view'),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          sql`${analyticsEvents.metadata} ->> 'region' IS NOT NULL`,
        ),
      )
      .groupBy(region, country)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    return rows.map((r) => ({
      region: r.region,
      country: r.country,
      views: Number(r.views),
      topCity: r.topCity,
    }));
  }

  async viewsByCity(since: Date, until: Date, limit: number): Promise<CityViews[]> {
    const city = sql<string>`${analyticsEvents.metadata} ->> 'city'`;
    const region = sql<string | null>`${analyticsEvents.metadata} ->> 'region'`;
    const country = sql<string>`${analyticsEvents.metadata} ->> 'country'`;
    const latitude = sql<string>`${analyticsEvents.metadata} ->> 'latitude'`;
    const longitude = sql<string>`${analyticsEvents.metadata} ->> 'longitude'`;

    const rows = await this.db
      .select({ city, region, country, latitude, longitude, views: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'page_view'),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          sql`${analyticsEvents.metadata} ->> 'city' IS NOT NULL`,
          // Grouped on the coordinates too, so a city without them can't
          // collapse into one that has them.
          sql`${analyticsEvents.metadata} ->> 'latitude' IS NOT NULL`,
        ),
      )
      .groupBy(city, region, country, latitude, longitude)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    return rows.map((r) => ({
      city: r.city,
      region: r.region,
      country: r.country,
      views: Number(r.views),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
    }));
  }

  async averageDwellByPath(since: Date, until: Date, limit: number): Promise<PathDwell[]> {
    // durationMs is written as a JSON number; `->>` yields text, so it is
    // cast explicitly rather than relying on implicit coercion.
    const rows = await this.db
      .select({
        path: analyticsEvents.path,
        meanMs: sql<number>`avg((${analyticsEvents.metadata} ->> 'durationMs')::numeric)`,
        samples: sql<number>`count(*)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'page_exit'),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          isNotNull(analyticsEvents.path),
          sql`${analyticsEvents.metadata} ->> 'durationMs' IS NOT NULL`,
        ),
      )
      .groupBy(analyticsEvents.path)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    return rows.flatMap((r) =>
      r.path === null
        ? []
        : [{ path: r.path, meanMs: Math.round(Number(r.meanMs)), samples: Number(r.samples) }],
    );
  }

  async listBySessionId(sessionId: string, since: Date, until: Date): Promise<AnalyticsEventRow[]> {
    const rows = await this.db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.sessionId, sessionId),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
        ),
      )
      .orderBy(asc(analyticsEvents.createdAt));
    return rows.map(toRow);
  }
}
