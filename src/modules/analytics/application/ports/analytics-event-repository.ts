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
}
