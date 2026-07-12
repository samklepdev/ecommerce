import type Redis from 'ioredis';

import type { ProcessedEventStore } from '@/modules/orders/application/use-cases/confirm-payment';

/**
 * De-dupes payment events by id so re-polled/redelivered events are handled once.
 * Entries expire after a TTL — long enough that no in-flight redelivery slips
 * through, short enough to not grow unbounded.
 */
export class RedisProcessedEventStore implements ProcessedEventStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = 60 * 60 * 24 * 7, // 7 days
    private readonly prefix = 'evt:seen:',
  ) {}

  async seen(eventId: string): Promise<boolean> {
    return (await this.redis.exists(this.prefix + eventId)) === 1;
  }

  async markSeen(eventId: string): Promise<void> {
    await this.redis.set(this.prefix + eventId, '1', 'EX', this.ttlSeconds);
  }
}
