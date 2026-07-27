import { describe, expect, it } from 'vitest';

import { GetEventsForIdentity } from './get-events-for-identity';
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
    async viewsByCountry() {
      return [];
    },
    async viewsByRegion() {
      return [];
    },
    async viewsByCity() {
      return [];
    },
    async listBySessionId() {
      return [];
    },
    ...overrides,
  };
}

describe('GetEventsForIdentity', () => {
  it('passes sessionId, since, and until through to the repository', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const events: AnalyticsEventRow[] = [
      {
        id: 'evt-1',
        eventType: 'page_view',
        sessionId: 'user-42',
        userId: 'user-42',
        path: '/products',
        referrer: null,
        userAgent: null,
        ipAddress: null,
        metadata: null,
        createdAt: new Date('2026-01-05'),
      },
    ];

    const repo = fakeRepo({
      async listBySessionId(sessionId, s, u) {
        expect(sessionId).toBe('user-42');
        expect(s).toBe(since);
        expect(u).toBe(until);
        return events;
      },
    });

    const result = await new GetEventsForIdentity(repo).execute({ sessionId: 'user-42', since, until });

    expect(result).toEqual({ events });
  });

  it('returns an empty list when the identity has no events in range', async () => {
    const repo = fakeRepo();

    const result = await new GetEventsForIdentity(repo).execute({
      sessionId: 'nobody',
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({ events: [] });
  });
});
