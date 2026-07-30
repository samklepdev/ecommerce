import { describe, expect, it } from 'vitest';

import { PruneAnalyticsEvents } from './prune-analytics-events';
import type { AnalyticsEventRepository } from '@/modules/analytics/application/ports/analytics-event-repository';

const NOW = new Date('2026-07-30T12:00:00.000Z');

function makeRepo(deleted = 0) {
  const calls: { before: Date; batchSize: number }[] = [];
  const repo = {
    async deleteOlderThan(before: Date, batchSize: number) {
      calls.push({ before, batchSize });
      return deleted;
    },
  } as unknown as AnalyticsEventRepository;
  return { repo, calls };
}

describe('PruneAnalyticsEvents', () => {
  it('cuts at exactly the retention window before now', async () => {
    const { repo, calls } = makeRepo();

    await new PruneAnalyticsEvents(repo, 90, () => NOW).execute();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.before.toISOString()).toBe('2026-05-01T12:00:00.000Z');
  });

  it('honours a shorter retention window', async () => {
    const { repo, calls } = makeRepo();

    await new PruneAnalyticsEvents(repo, 7, () => NOW).execute();

    expect(calls[0]!.before.toISOString()).toBe('2026-07-23T12:00:00.000Z');
  });

  it('reports how many rows went', async () => {
    const { repo } = makeRepo(12_500);

    expect(await new PruneAnalyticsEvents(repo, 90, () => NOW).execute()).toEqual({
      deleted: 12_500,
    });
  });

  // Deleting in batches is the point of the port method — one unbounded
  // DELETE would hold a lock on the busiest-writing table in the schema.
  it('asks for a bounded batch rather than an open-ended delete', async () => {
    const { repo, calls } = makeRepo();

    await new PruneAnalyticsEvents(repo, 90, () => NOW).execute();

    expect(calls[0]!.batchSize).toBeGreaterThan(0);
    expect(Number.isInteger(calls[0]!.batchSize)).toBe(true);
  });
});
