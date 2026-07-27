import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
} from '@/modules/analytics/application/ports/analytics-event-repository';
import type { IpGeoLookup } from '@/modules/analytics/application/ports/ip-geo-lookup';

/** Best-effort tracking — callers fire this from `after()` (page views) or
 * inline (cart changes) and never let a failure here affect the request.
 *
 * Country is resolved here rather than at each call site, so every event type
 * carries it on the same terms and the one place that turns a visitor's IP
 * into a location is a single tested seam. */
export class RecordAnalyticsEvent implements UseCase<AnalyticsEventInput, void> {
  constructor(
    private readonly events: AnalyticsEventRepository,
    /** Optional so tests and any caller that doesn't care about location can
     * construct this with the repository alone. */
    private readonly geo?: IpGeoLookup,
  ) {}

  async execute(input: AnalyticsEventInput): Promise<void> {
    await this.events.record(await this.withLocation(input));
  }

  /** Adds `country`/`continent` to the event's metadata when the address
   * resolves. A private or unknown IP contributes nothing — that's an
   * ordinary outcome in local development, not a failure. */
  private async withLocation(input: AnalyticsEventInput): Promise<AnalyticsEventInput> {
    if (!this.geo || !input.ipAddress) return input;

    const location = await this.geo.lookup(input.ipAddress);
    if (!location) return input;

    return {
      ...input,
      metadata: {
        ...input.metadata,
        country: location.country,
        countryCode: location.countryCode,
        continent: location.continent,
      },
    };
  }
}
