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
   * since `since`. */
  listConfirmedWithOrderInfo(since: Date): Promise<OnChainOrderActivity[]>;
}

export interface GetOnChainActivityReportInput {
  sinceDays: number;
}

export interface GetOnChainActivityReportResult {
  totalSats: number;
  addressCount: number;
  orders: OnChainOrderActivity[];
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
    const since = new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000);
    const orders = await this.report.listConfirmedWithOrderInfo(since);

    const totalSats = orders.reduce((sum, o) => sum + o.expectedSats, 0);
    const addressCount = new Set(orders.map((o) => o.address)).size;

    return { totalSats, addressCount, orders };
  }
}
