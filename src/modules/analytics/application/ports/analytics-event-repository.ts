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
  /** ISO 3166-1 alpha-2. The map joins geometry on this rather than on the
   * name — "United States" vs "United States of America" would silently
   * never match. */
  countryCode: string;
  country: string;
  continent: string;
  views: number;
  /** One representative address for the country, so an admin can spot-check
   * a row. Deliberately a sample, not a list — the point of this breakdown
   * is the aggregate, and enumerating every visitor's IP here would be a
   * needless spread of personal data across the UI. */
  sampleIp: string | null;
}

export interface RegionViews {
  region: string;
  country: string;
  views: number;
  /** Most-seen city within the region, when one resolved. Cities are far
   * less reliable than regions — an address often lands on the ISP's hub
   * rather than the visitor's town — so it's context, not a finding. */
  topCity: string | null;
}

export interface CityViews {
  city: string;
  region: string | null;
  country: string;
  views: number;
  /** Coordinates of the *city*, not of any visitor — the database locates
   * the place, not the person. */
  latitude: number;
  longitude: number;
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
  /** Page views grouped by first-level subdivision (state, province,
   * region), busiest first. Events that only resolved to country level are
   * excluded rather than bucketed as "Unknown" — the region genuinely isn't
   * known for them. */
  viewsByRegion(since: Date, until: Date, limit: number): Promise<RegionViews[]>;
  /** Page views grouped by city, busiest first. Only cities that resolved
   * with coordinates — a city we can't place is no use to a map. */
  viewsByCity(since: Date, until: Date, limit: number): Promise<CityViews[]>;
  /** Mean dwell time per path, in milliseconds, from `page_exit` events —
   * paths with no exit events recorded simply don't appear. */
  averageDwellByPath(since: Date, until: Date, limit: number): Promise<PathDwell[]>;
  /** All web events (any type) for one `sessionId`, chronological
   * (oldest first) — backs the per-identity timeline. Logged-in users
   * always have `sessionId === userId` at write time, so this same
   * column serves both guest and logged-in lookups. */
  listBySessionId(sessionId: string, since: Date, until: Date): Promise<AnalyticsEventRow[]>;
}
