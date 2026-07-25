import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
} from '@/modules/analytics/application/ports/analytics-event-repository';

/** Best-effort tracking — callers fire this from `after()` (page views) or
 * inline (cart changes) and never let a failure here affect the request. */
export class RecordAnalyticsEvent implements UseCase<AnalyticsEventInput, void> {
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: AnalyticsEventInput): Promise<void> {
    await this.events.record(input);
  }
}
