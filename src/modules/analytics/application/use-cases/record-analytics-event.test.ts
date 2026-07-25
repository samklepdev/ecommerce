import { describe, expect, it } from 'vitest';

import { RecordAnalyticsEvent } from './record-analytics-event';
import type { AnalyticsEventInput, AnalyticsEventRepository } from '@/modules/analytics/application/ports/analytics-event-repository';

describe('RecordAnalyticsEvent', () => {
  it('passes the event through to the repository', async () => {
    const recorded: AnalyticsEventInput[] = [];
    const repo: AnalyticsEventRepository = {
      async record(event) {
        recorded.push(event);
      },
      async countByTypePerDay() {
        return [];
      },
      async topValues() {
        return [];
      },
      async topSearchTerms() {
        return [];
      },
    };

    const input: AnalyticsEventInput = {
      eventType: 'page_view',
      sessionId: 's1',
      userId: null,
      path: '/products',
    };
    await new RecordAnalyticsEvent(repo).execute(input);

    expect(recorded).toEqual([input]);
  });
});
