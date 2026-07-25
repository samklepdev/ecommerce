import { describe, expect, it } from 'vitest';

import {
  GetOnChainActivityReport,
  type OnChainActivityReportRepository,
  type OnChainOrderActivity,
} from './get-on-chain-activity-report';

describe('GetOnChainActivityReport', () => {
  it('sums sats and counts distinct addresses', async () => {
    const orders: OnChainOrderActivity[] = [
      { orderId: 'o1', address: 'addr1', expectedSats: 100000, underpaid: false, overpaid: false, confirmations: 3, paidAt: new Date() },
      { orderId: 'o2', address: 'addr2', expectedSats: 50000, underpaid: true, overpaid: false, confirmations: 3, paidAt: new Date() },
      { orderId: 'o3', address: 'addr1', expectedSats: 25000, underpaid: false, overpaid: false, confirmations: 3, paidAt: new Date() },
    ];
    const repo: OnChainActivityReportRepository = {
      async listConfirmedWithOrderInfo(since) {
        expect(since).toBeInstanceOf(Date);
        return orders;
      },
    };

    const result = await new GetOnChainActivityReport(repo).execute({ sinceDays: 30 });

    expect(result).toEqual({ totalSats: 175000, addressCount: 2, orders });
  });

  it('returns zeros for no activity', async () => {
    const repo: OnChainActivityReportRepository = {
      async listConfirmedWithOrderInfo() {
        return [];
      },
    };

    const result = await new GetOnChainActivityReport(repo).execute({ sinceDays: 30 });

    expect(result).toEqual({ totalSats: 0, addressCount: 0, orders: [] });
  });
});
