import { describe, expect, it } from 'vitest';

import {
  GetOnChainActivityReport,
  type OnChainActivityReportRepository,
  type OnChainOrderActivity,
} from './get-on-chain-activity-report';

describe('GetOnChainActivityReport', () => {
  it('sums sats, counts distinct addresses, and groups sats by day', async () => {
    const orders: OnChainOrderActivity[] = [
      { orderId: 'o1', address: 'addr1', expectedSats: 100000, underpaid: false, overpaid: false, confirmations: 3, paidAt: new Date('2026-01-01T10:00:00Z') },
      { orderId: 'o2', address: 'addr2', expectedSats: 50000, underpaid: true, overpaid: false, confirmations: 3, paidAt: new Date('2026-01-01T18:00:00Z') },
      { orderId: 'o3', address: 'addr1', expectedSats: 25000, underpaid: false, overpaid: false, confirmations: 3, paidAt: new Date('2026-01-02T09:00:00Z') },
    ];
    const repo: OnChainActivityReportRepository = {
      async listConfirmedWithOrderInfo(since, until) {
        expect(since).toBeInstanceOf(Date);
        expect(until).toBeInstanceOf(Date);
        return orders;
      },
    };

    const result = await new GetOnChainActivityReport(repo).execute({
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({
      totalSats: 175000,
      addressCount: 2,
      orders,
      satsPerDay: [
        { day: '2026-01-01', sats: 150000 },
        { day: '2026-01-02', sats: 25000 },
      ],
    });
  });

  it('returns zeros and an empty day list for no activity', async () => {
    const repo: OnChainActivityReportRepository = {
      async listConfirmedWithOrderInfo() {
        return [];
      },
    };

    const result = await new GetOnChainActivityReport(repo).execute({
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({ totalSats: 0, addressCount: 0, orders: [], satsPerDay: [] });
  });
});
