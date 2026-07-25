import type { UseCase } from '@/shared/application/use-case';
import type { AnalyticsEventRepository, AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';

export interface GetEventsForIdentityInput {
  sessionId: string;
  since: Date;
  until: Date;
}

export interface GetEventsForIdentityResult {
  events: AnalyticsEventRow[];
}

/** Takes an already-resolved sessionId (or, for a logged-in user, their
 * userId — the two are the same value at write time, see the port's doc
 * comment on `listBySessionId`). Email-to-identity resolution happens at
 * the page level via `FindUserByEmailForAdmin`. */
export class GetEventsForIdentity implements UseCase<GetEventsForIdentityInput, GetEventsForIdentityResult> {
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: GetEventsForIdentityInput): Promise<GetEventsForIdentityResult> {
    const events = await this.events.listBySessionId(input.sessionId, input.since, input.until);
    return { events };
  }
}
