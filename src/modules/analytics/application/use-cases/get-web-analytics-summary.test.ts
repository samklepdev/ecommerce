import { describe, expect, it } from 'vitest';

import { GetWebAnalyticsSummary } from './get-web-analytics-summary';
import type { AnalyticsEventRepository, DailyCount, ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';

describe('GetWebAnalyticsSummary', () => {
  it('aggregates page views, cart changes, top paths, top referrers, and top search terms', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const pageViewsPerDay: DailyCount[] = [{ day: '2026-01-01', count: 5 }];
    const cartChangesPerDay: DailyCount[] = [{ day: '2026-01-01', count: 2 }];
    const topPaths: ValueCount[] = [{ value: '/products', count: 5 }];
    const topReferrers: ValueCount[] = [{ value: 'https://google.com', count: 3 }];
    const topSearchTerms: ValueCount[] = [{ value: 'test', count: 2 }];

    const repo: AnalyticsEventRepository = {
      async record() {},
      async countByTypePerDay(eventType, s, u) {
        expect(s).toBe(since);
        expect(u).toBe(until);
        return eventType === 'page_view' ? pageViewsPerDay : cartChangesPerDay;
      },
      async topValues(eventType, field) {
        expect(eventType).toBe('page_view');
        return field === 'path' ? topPaths : topReferrers;
      },
      async topSearchTerms() {
        return topSearchTerms;
      },
    };

    const result = await new GetWebAnalyticsSummary(repo).execute({ since, until });

    expect(result).toEqual({ pageViewsPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay });
  });
});
