import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventRepository,
  CountryViews,
  CityViews,
  DailyCount,
  PathDwell,
  RegionViews,
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
  /** Page views by country, resolved from the visitor's IP at record time. */
  viewsByCountry: CountryViews[];
  /** The same, one level finer: state, province or region. */
  viewsByRegion: RegionViews[];
  /** Finer still, with coordinates, for the map's city markers. */
  viewsByCity: CityViews[];
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
      viewsByCountry,
      viewsByRegion,
      viewsByCity,
    ] = await Promise.all([
        this.events.countByTypePerDay('page_view', since, until),
        this.events.countByTypePerDay('search', since, until),
        this.events.topValues('page_view', 'path', since, until, TOP_LIMIT),
        this.events.topValues('page_view', 'referrer', since, until, TOP_LIMIT),
        this.events.topSearchTerms(since, until, TOP_LIMIT),
        this.events.countByTypePerDay('cart_changed', since, until),
        this.events.averageDwellByPath(since, until, TOP_LIMIT),
        this.events.viewsByCountry(since, until, TOP_LIMIT),
        this.events.viewsByRegion(since, until, TOP_LIMIT),
        this.events.viewsByCity(since, until, TOP_LIMIT),
      ]);

    return {
      pageViewsPerDay,
      searchesPerDay,
      topPaths,
      topReferrers,
      topSearchTerms,
      cartChangesPerDay,
      dwellByPath,
      viewsByCountry,
      viewsByRegion,
      viewsByCity,
    };
  }
}
