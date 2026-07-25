import type { UseCase } from '@/shared/application/use-case';

export interface OnChainOrderActivity {
  orderId: string;
  address: string;
  /** Proxy for actually-received sats — accurate in the common exact-payment
   * case; `underpaid`/`overpaid` are surfaced per-row so an admin can see
   * where this might be off, rather than presenting a falsely-precise
   * total. Deliberately not derived from live chain data — see
   * `GetOnChainActivityReport`'s doc comment. */
  expectedSats: number;
  underpaid: boolean;
  overpaid: boolean;
  confirmations: number;
  paidAt: Date;
}

export interface OnChainActivityReportRepository {
  /** `orders.paymentStatus = 'paid'` joined with `bitcoin_payment_intents`,
   * within `[since, until]`. */
  listConfirmedWithOrderInfo(since: Date, until: Date): Promise<OnChainOrderActivity[]>;
}

export interface GetOnChainActivityReportInput {
  since: Date;
  until: Date;
}

export interface DailySats {
  day: string;
  sats: number;
}

export interface GetOnChainActivityReportResult {
  totalSats: number;
  addressCount: number;
  orders: OnChainOrderActivity[];
  satsPerDay: DailySats[];
}

/**
 * Deliberately read-only, built entirely from already-durable data — never
 * touches ConfirmPayment, the gateway, or the chain watcher. Actual
 * confirmed sats aren't persisted anywhere (computed in-memory by the
 * watcher and discarded); persisting them would mean instrumenting the
 * most sensitive part of this codebase for a reporting nice-to-have, which
 * isn't worth the risk. `expectedSats` on a paid order is an accurate
 * stand-in in the overwhelming common exact-payment case.
 */
export class GetOnChainActivityReport
  implements UseCase<GetOnChainActivityReportInput, GetOnChainActivityReportResult>
{
  constructor(private readonly report: OnChainActivityReportRepository) {}

  async execute(input: GetOnChainActivityReportInput): Promise<GetOnChainActivityReportResult> {
    const orders = await this.report.listConfirmedWithOrderInfo(input.since, input.until);

    const totalSats = orders.reduce((sum, o) => sum + o.expectedSats, 0);
    const addressCount = new Set(orders.map((o) => o.address)).size;

    const byDay = new Map<string, number>();
    for (const o of orders) {
      const day = o.paidAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + o.expectedSats);
    }
    const satsPerDay = [...byDay.entries()]
      .map(([day, sats]) => ({ day, sats }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return { totalSats, addressCount, orders, satsPerDay };
  }
}
