import type { UseCase } from '@/shared/application/use-case';

export interface OnChainOrderActivity {
  orderId: string;
  address: string;
  /** What was asked for. Kept alongside `confirmedSats` so a discrepancy is
   * legible rather than implied by a flag. */
  expectedSats: number;
  /** What actually arrived. 0 only for orders confirmed before this was
   * recorded (0030) — a paid order cannot genuinely have received nothing. */
  confirmedSats: number;
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
 * touches ConfirmPayment, the gateway, or the chain watcher.
 *
 * Totals on **`confirmedSats`**, what actually arrived. This used to total
 * `expectedSats` and say so, on the grounds that persisting the real figure
 * meant instrumenting the most sensitive code here for a reporting
 * nice-to-have. That reasoning didn't hold: the substitution is exact only when
 * the payment was exact, so the revenue number was quietly wrong for precisely
 * the underpaid and overpaid orders worth investigating — and with no refund
 * mechanism, the discrepancy is the only evidence there's anything to resolve.
 *
 * Falls back to `expectedSats` for rows confirmed before 0030, which have no
 * observation to report. A paid order cannot genuinely have received 0 sats, so
 * 0 is an unambiguous "not recorded".
 */
export class GetOnChainActivityReport
  implements UseCase<GetOnChainActivityReportInput, GetOnChainActivityReportResult>
{
  constructor(private readonly report: OnChainActivityReportRepository) {}

  async execute(input: GetOnChainActivityReportInput): Promise<GetOnChainActivityReportResult> {
    const orders = await this.report.listConfirmedWithOrderInfo(input.since, input.until);

    // One definition of "received", used by both figures below. When the total
    // moved to `confirmedSats` the daily breakdown was left on `expectedSats`,
    // so the chart and the headline disagreed for exactly the underpaid and
    // overpaid orders worth looking at.
    const received = (o: OnChainOrderActivity) => o.confirmedSats || o.expectedSats;

    const totalSats = orders.reduce((sum, o) => sum + received(o), 0);
    const addressCount = new Set(orders.map((o) => o.address)).size;

    const byDay = new Map<string, number>();
    for (const o of orders) {
      const day = o.paidAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + received(o));
    }
    const satsPerDay = [...byDay.entries()]
      .map(([day, sats]) => ({ day, sats }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return { totalSats, addressCount, orders, satsPerDay };
  }
}
