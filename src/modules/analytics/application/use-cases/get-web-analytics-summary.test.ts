import { describe, expect, it } from 'vitest';

import { GetWebAnalyticsSummary } from './get-web-analytics-summary';
import type { AnalyticsEventRepository, DailyCount, ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';

describe('GetWebAnalyticsSummary', () => {
  it('aggregates page views, searches, cart changes, top paths, top referrers, and top search terms', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const pageViewsPerDay: DailyCount[] = [{ day: '2026-01-01', count: 5 }];
    const searchesPerDay: DailyCount[] = [{ day: '2026-01-01', count: 1 }];
    const cartChangesPerDay: DailyCount[] = [{ day: '2026-01-01', count: 2 }];
    const topPaths: ValueCount[] = [{ value: '/products', count: 5 }];
    const topReferrers: ValueCount[] = [{ value: 'https://google.com', count: 3 }];
    const topSearchTerms: ValueCount[] = [{ value: 'test', count: 2 }];

    // Cast (not a direct typed literal) deliberately: Task 9 (later in this
    // plan) adds `listByType`/`listBySessionId` to `AnalyticsEventRepository`.
    // A plain `const repo: AnalyticsEventRepository = {...}` would fail
    // TypeScript's excess-property check right now, before Task 9 lands —
    // `as` sidesteps that check and stays valid once Task 9 does land, since
    // the object is a structurally complete `AnalyticsEventRepository`
    // either way.
    const repo = {
      async record() {},
      async deleteOlderThan() { return 0; },
      async countByTypePerDay(eventType, s, u) {
        expect(s).toBe(since);
        expect(u).toBe(until);
        if (eventType === 'page_view') return pageViewsPerDay;
        if (eventType === 'search') return searchesPerDay;
        return cartChangesPerDay;
      },
      async topValues(eventType, field) {
        expect(eventType).toBe('page_view');
        return field === 'path' ? topPaths : topReferrers;
      },
      async topSearchTerms() {
        return topSearchTerms;
      },
      async listByType() {
        throw new Error('not used by this use case');
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
        throw new Error('not used by this use case');
      },
    } as AnalyticsEventRepository;

    const result = await new GetWebAnalyticsSummary(repo).execute({ since, until });

    expect(result).toEqual({
      pageViewsPerDay,
      searchesPerDay,
      topPaths,
      topReferrers,
      topSearchTerms,
      cartChangesPerDay,
      dwellByPath: [],
      viewsByCountry: [],
      viewsByRegion: [],
      viewsByCity: [],
    });
  });
});
