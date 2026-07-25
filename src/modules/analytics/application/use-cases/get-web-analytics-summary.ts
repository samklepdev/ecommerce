import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventRepository,
  DailyCount,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export interface GetWebAnalyticsSummaryInput {
  sinceDays: number;
}

export interface GetWebAnalyticsSummaryResult {
  pageViewsPerDay: DailyCount[];
  topPaths: ValueCount[];
  topReferrers: ValueCount[];
  topSearchTerms: ValueCount[];
}

const TOP_LIMIT = 10;

export class GetWebAnalyticsSummary
  implements UseCase<GetWebAnalyticsSummaryInput, GetWebAnalyticsSummaryResult>
{
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: GetWebAnalyticsSummaryInput): Promise<GetWebAnalyticsSummaryResult> {
    const since = new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000);

    const [pageViewsPerDay, topPaths, topReferrers, topSearchTerms] = await Promise.all([
      this.events.countByTypePerDay('page_view', since),
      this.events.topValues('page_view', 'path', since, TOP_LIMIT),
      this.events.topValues('page_view', 'referrer', since, TOP_LIMIT),
      this.events.topSearchTerms(since, TOP_LIMIT),
    ]);

    return { pageViewsPerDay, topPaths, topReferrers, topSearchTerms };
  }
}
