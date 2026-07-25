import type { UseCase } from '@/shared/application/use-case';

export interface DailyRevenue {
  day: string;
  totalMinor: number;
  orderCount: number;
  totalQuantity: number;
}

export interface RevenueSummaryRepository {
  /** `order_events` rows where `eventType = 'order_created'`, joined to
   * `orders` for currency, grouped by day, within `[since, until]`.
   * `currency` is `null` only when there's no revenue in range at all —
   * this store only ever creates orders in one currency (see
   * `CLAUDE.md`'s Money conventions), so there's nothing to reconcile
   * across rows when there is data. */
  getDailyRevenue(since: Date, until: Date): Promise<{ currency: string | null; days: DailyRevenue[] }>;
}

export interface GetRevenueSummaryInput {
  since: Date;
  until: Date;
}

export interface GetRevenueSummaryResult {
  currency: string;
  days: DailyRevenue[];
}

const FALLBACK_CURRENCY = 'USD';

export class GetRevenueSummary implements UseCase<GetRevenueSummaryInput, GetRevenueSummaryResult> {
  constructor(private readonly repo: RevenueSummaryRepository) {}

  async execute(input: GetRevenueSummaryInput): Promise<GetRevenueSummaryResult> {
    const { currency, days } = await this.repo.getDailyRevenue(input.since, input.until);
    return { currency: currency ?? FALLBACK_CURRENCY, days };
  }
}
