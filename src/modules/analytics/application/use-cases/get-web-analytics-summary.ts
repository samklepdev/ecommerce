import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventRepository,
  DailyCount,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export interface GetWebAnalyticsSummaryInput {
  since: Date;
  until: Date;
}

export interface GetWebAnalyticsSummaryResult {
  pageViewsPerDay: DailyCount[];
  topPaths: ValueCount[];
  topReferrers: ValueCount[];
  topSearchTerms: ValueCount[];
  cartChangesPerDay: DailyCount[];
}

const TOP_LIMIT = 10;

export class GetWebAnalyticsSummary
  implements UseCase<GetWebAnalyticsSummaryInput, GetWebAnalyticsSummaryResult>
{
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: GetWebAnalyticsSummaryInput): Promise<GetWebAnalyticsSummaryResult> {
    const { since, until } = input;

    const [pageViewsPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay] =
      await Promise.all([
        this.events.countByTypePerDay('page_view', since, until),
        this.events.topValues('page_view', 'path', since, until, TOP_LIMIT),
        this.events.topValues('page_view', 'referrer', since, until, TOP_LIMIT),
        this.events.topSearchTerms(since, until, TOP_LIMIT),
        this.events.countByTypePerDay('cart_changed', since, until),
      ]);

    return { pageViewsPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay };
  }
}
