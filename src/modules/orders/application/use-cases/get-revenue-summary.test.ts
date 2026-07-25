import { describe, expect, it } from 'vitest';

import {
  GetRevenueSummary,
  type DailyRevenue,
  type RevenueSummaryRepository,
} from './get-revenue-summary';

describe('GetRevenueSummary', () => {
  it('passes through the repository result', async () => {
    const days: DailyRevenue[] = [
      { day: '2026-01-01', totalMinor: 5000, orderCount: 2, totalQuantity: 3 },
    ];
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const repo: RevenueSummaryRepository = {
      async getDailyRevenue(s, u) {
        expect(s).toBe(since);
        expect(u).toBe(until);
        return { currency: 'USD', days };
      },
    };

    const result = await new GetRevenueSummary(repo).execute({ since, until });

    expect(result).toEqual({ currency: 'USD', days });
  });

  it('defaults currency to USD when there is no revenue in range', async () => {
    const repo: RevenueSummaryRepository = {
      async getDailyRevenue() {
        return { currency: null, days: [] };
      },
    };

    const result = await new GetRevenueSummary(repo).execute({
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({ currency: 'USD', days: [] });
  });
});
