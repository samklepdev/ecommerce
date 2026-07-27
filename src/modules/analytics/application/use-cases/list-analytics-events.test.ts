import { describe, expect, it } from 'vitest';

import { ListAnalyticsEvents } from './list-analytics-events';
import type { AnalyticsEventRepository, AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';

function fakeRepo(overrides: Partial<AnalyticsEventRepository> = {}): AnalyticsEventRepository {
  return {
    async record() {},
    async countByTypePerDay() {
      return [];
    },
    async topValues() {
      return [];
    },
    async topSearchTerms() {
      return [];
    },
    async listByType() {
      return { items: [], total: 0 };
    },
    async averageDwellByPath() {
      return [];
    },
    async listBySessionId() {
      return [];
    },
    ...overrides,
  };
}

describe('ListAnalyticsEvents', () => {
  it('passes eventType, since, until, limit, and offset through to the repository', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const items: AnalyticsEventRow[] = [
      {
        id: 'evt-1',
        eventType: 'page_view',
        sessionId: 'sess-1',
        userId: null,
        path: '/products',
        referrer: null,
        userAgent: null,
        ipAddress: null,
        metadata: null,
        createdAt: new Date('2026-01-05'),
      },
    ];

    const repo = fakeRepo({
      async listByType(eventType, s, u, limit, offset) {
        expect(eventType).toBe('page_view');
        expect(s).toBe(since);
        expect(u).toBe(until);
        expect(limit).toBe(25);
        expect(offset).toBe(50);
        return { items, total: 137 };
      },
    });

    const result = await new ListAnalyticsEvents(repo).execute({
      eventType: 'page_view',
      since,
      until,
      limit: 25,
      offset: 50,
    });

    expect(result).toEqual({ items, total: 137 });
  });

  it('returns an empty result when there are no matching rows', async () => {
    const repo = fakeRepo();

    const result = await new ListAnalyticsEvents(repo).execute({
      eventType: 'search',
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
      limit: 25,
      offset: 0,
    });

    expect(result).toEqual({ items: [], total: 0 });
  });
});
