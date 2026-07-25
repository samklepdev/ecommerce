import { describe, expect, it } from 'vitest';

import { GetWebAnalyticsSummary } from './get-web-analytics-summary';
import type { AnalyticsEventRepository, DailyCount, ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';

describe('GetWebAnalyticsSummary', () => {
  it('aggregates page views per day, top paths, top referrers, and top search terms', async () => {
    const pageViewsPerDay: DailyCount[] = [{ day: '2026-01-01', count: 5 }];
    const topPaths: ValueCount[] = [{ value: '/products', count: 5 }];
    const topReferrers: ValueCount[] = [{ value: 'https://google.com', count: 3 }];
    const topSearchTerms: ValueCount[] = [{ value: 'test', count: 2 }];

    const repo: AnalyticsEventRepository = {
      async record() {},
      async countByTypePerDay(eventType) {
        expect(eventType).toBe('page_view');
        return pageViewsPerDay;
      },
      async topValues(eventType, field) {
        expect(eventType).toBe('page_view');
        return field === 'path' ? topPaths : topReferrers;
      },
      async topSearchTerms() {
        return topSearchTerms;
      },
    };

    const result = await new GetWebAnalyticsSummary(repo).execute({ sinceDays: 30 });

    expect(result).toEqual({ pageViewsPerDay, topPaths, topReferrers, topSearchTerms });
  });
});
