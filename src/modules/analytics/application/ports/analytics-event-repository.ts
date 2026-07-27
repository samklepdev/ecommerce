/** `page_exit` carries how long a visitor stayed, in `metadata.durationMs`.
 * It's a separate event rather than a column on `page_view` because the
 * duration is only known once the visitor leaves — updating the original
 * row would race the `after()` insert that wrote it. */
export type AnalyticsEventType = 'page_view' | 'search' | 'cart_changed' | 'page_exit';

export interface AnalyticsEventInput {
  eventType: AnalyticsEventType;
  sessionId: string | null;
  userId: string | null;
  path?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface ValueCount {
  value: string;
  count: number;
}

export interface CountryViews {
  country: string;
  continent: string;
  views: number;
  /** One representative address for the country, so an admin can spot-check
   * a row. Deliberately a sample, not a list — the point of this breakdown
   * is the aggregate, and enumerating every visitor's IP here would be a
   * needless spread of personal data across the UI. */
  sampleIp: string | null;
}

export interface PathDwell {
  path: string;
  meanMs: number;
  /** How many exits the mean is drawn from — a 4-minute mean over two
   * visits is not the same claim as one over two thousand. */
  samples: number;
}

/** A raw stored row — backs the per-event-type pages' tables, their CSV
 * export, and the per-identity timeline. */
export interface AnalyticsEventRow {
  id: string;
  eventType: AnalyticsEventType;
  sessionId: string | null;
  userId: string | null;
  path: string | null;
  referrer: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AnalyticsEventRepository {
  record(event: AnalyticsEventInput): Promise<void>;
  countByTypePerDay(eventType: AnalyticsEventType, since: Date, until: Date): Promise<DailyCount[]>;
  topValues(
    eventType: AnalyticsEventType,
    field: 'path' | 'referrer',
    since: Date,
    until: Date,
    limit: number,
  ): Promise<ValueCount[]>;
  /** Top search terms, read from `metadata.term` on `search` events. */
  topSearchTerms(since: Date, until: Date, limit: number): Promise<ValueCount[]>;
  /** Paginated raw rows for one event type, newest first — backs each
   * per-type page's table and CSV export.
   *
   * `pathContains` narrows to rows whose `path` contains that substring,
   * case-insensitively. Undefined means no path filter at all, which is not
   * the same as an empty string. */
  listByType(
    eventType: AnalyticsEventType,
    since: Date,
    until: Date,
    limit: number,
    offset: number,
    pathContains?: string,
  ): Promise<{ items: AnalyticsEventRow[]; total: number }>;
  /** Page views grouped by the country resolved at record time, busiest
   * first. Events whose IP didn't resolve are excluded rather than bucketed
   * as "Unknown" — a private or missing address says nothing about where
   * the visitor was. */
  viewsByCountry(since: Date, until: Date, limit: number): Promise<CountryViews[]>;
  /** Mean dwell time per path, in milliseconds, from `page_exit` events —
   * paths with no exit events recorded simply don't appear. */
  averageDwellByPath(since: Date, until: Date, limit: number): Promise<PathDwell[]>;
  /** All web events (any type) for one `sessionId`, chronological
   * (oldest first) — backs the per-identity timeline. Logged-in users
   * always have `sessionId === userId` at write time, so this same
   * column serves both guest and logged-in lookups. */
  listBySessionId(sessionId: string, since: Date, until: Date): Promise<AnalyticsEventRow[]>;
}
