import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventRepository,
  DailyCount,
  PathDwell,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export interface GetWebAnalyticsSummaryInput {
  since: Date;
  until: Date;
}

export interface GetWebAnalyticsSummaryResult {
  pageViewsPerDay: DailyCount[];
  searchesPerDay: DailyCount[];
  topPaths: ValueCount[];
  topReferrers: ValueCount[];
  topSearchTerms: ValueCount[];
  cartChangesPerDay: DailyCount[];
  /** Mean time on page per path, from `page_exit` events. Empty until the
   * dwell tracker has seen traffic. */
  dwellByPath: PathDwell[];
}

const TOP_LIMIT = 10;

export class GetWebAnalyticsSummary
  implements UseCase<GetWebAnalyticsSummaryInput, GetWebAnalyticsSummaryResult>
{
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: GetWebAnalyticsSummaryInput): Promise<GetWebAnalyticsSummaryResult> {
    const { since, until } = input;

    const [
      pageViewsPerDay,
      searchesPerDay,
      topPaths,
      topReferrers,
      topSearchTerms,
      cartChangesPerDay,
      dwellByPath,
    ] = await Promise.all([
        this.events.countByTypePerDay('page_view', since, until),
        this.events.countByTypePerDay('search', since, until),
        this.events.topValues('page_view', 'path', since, until, TOP_LIMIT),
        this.events.topValues('page_view', 'referrer', since, until, TOP_LIMIT),
        this.events.topSearchTerms(since, until, TOP_LIMIT),
        this.events.countByTypePerDay('cart_changed', since, until),
        this.events.averageDwellByPath(since, until, TOP_LIMIT),
      ]);

    return {
      pageViewsPerDay,
      searchesPerDay,
      topPaths,
      topReferrers,
      topSearchTerms,
      cartChangesPerDay,
      dwellByPath,
    };
  }
}
