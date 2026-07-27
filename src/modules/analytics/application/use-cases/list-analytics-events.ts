import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventRepository,
  AnalyticsEventRow,
  AnalyticsEventType,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export interface ListAnalyticsEventsInput {
  eventType: AnalyticsEventType;
  since: Date;
  until: Date;
  limit: number;
  offset: number;
  /** Narrows to events whose path contains this substring. */
  pathContains?: string;
}

export interface ListAnalyticsEventsResult {
  items: AnalyticsEventRow[];
  total: number;
}

export class ListAnalyticsEvents implements UseCase<ListAnalyticsEventsInput, ListAnalyticsEventsResult> {
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: ListAnalyticsEventsInput): Promise<ListAnalyticsEventsResult> {
    return this.events.listByType(
      input.eventType,
      input.since,
      input.until,
      input.limit,
      input.offset,
      input.pathContains,
    );
  }
}
