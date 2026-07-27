export type AnalyticsEventType = 'page_view' | 'search' | 'cart_changed';

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
  /** All web events (any type) for one `sessionId`, chronological
   * (oldest first) — backs the per-identity timeline. Logged-in users
   * always have `sessionId === userId` at write time, so this same
   * column serves both guest and logged-in lookups. */
  listBySessionId(sessionId: string, since: Date, until: Date): Promise<AnalyticsEventRow[]>;
}
