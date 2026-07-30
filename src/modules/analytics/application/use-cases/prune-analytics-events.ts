import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { AnalyticsEventRepository } from '@/modules/analytics/application/ports/analytics-event-repository';

/** Big enough that a year of backlog clears in a sensible number of round
 * trips, small enough that each lock is short. */
const BATCH_SIZE = 5_000;

export interface PruneAnalyticsEventsResult {
  deleted: number;
}

/**
 * Drops analytics events past the retention window.
 *
 * `analytics_events` takes a row per page view, search, cart change and page
 * exit and never gave any of them back — it's the table that gets large
 * first, and the one whose growth nobody notices until a query that used to
 * be instant isn't. Nothing else in the schema needs this: orders and audit
 * entries are records you must keep.
 *
 * Retention is a business decision, not a technical one, so the window is
 * configuration. What isn't configurable is that it runs at all.
 */
export class PruneAnalyticsEvents implements UseCase<void, PruneAnalyticsEventsResult> {
  constructor(
    private readonly events: AnalyticsEventRepository,
    private readonly retentionDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<PruneAnalyticsEventsResult> {
    const cutoff = new Date(this.now().getTime() - this.retentionDays * 24 * 60 * 60 * 1000);
    const deleted = await this.events.deleteOlderThan(cutoff, BATCH_SIZE);

    // Only worth a line when it actually did something — a daily "deleted 0"
    // is noise that trains you to skim the logs.
    if (deleted > 0) {
      logger.info('pruned analytics events past the retention window', {
        deleted,
        retentionDays: this.retentionDays,
        cutoff: cutoff.toISOString(),
      });
    }

    return { deleted };
  }
}
