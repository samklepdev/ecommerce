import { describe, expect, it } from 'vitest';

import { CheckSystemHealth } from './check-system-health';
import type { HeartbeatStore, ServiceProbe } from '@/shared/application/ports/health-ports';

const NOW = new Date('2026-07-28T12:00:00.000Z');

function probe(ok: boolean): ServiceProbe {
  return {
    async ping() {
      if (!ok) throw new Error('connection refused to postgres://user:pw@host/db');
    },
  };
}

function heartbeat(lastSeen: Date | null): HeartbeatStore {
  return {
    async record() {},
    async lastSeen() {
      return lastSeen;
    },
  };
}

function makeUseCase(opts: {
  db?: boolean;
  cache?: boolean;
  watcherLastSeen?: Date | null;
  staleAfterMs?: number;
}) {
  return new CheckSystemHealth(
    probe(opts.db ?? true),
    probe(opts.cache ?? true),
    heartbeat(opts.watcherLastSeen === undefined ? NOW : opts.watcherLastSeen),
    opts.staleAfterMs ?? 135_000,
    () => NOW,
  );
}

describe('CheckSystemHealth', () => {
  it('is ok when both services answer and the watcher is fresh', async () => {
    const result = await makeUseCase({}).execute();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.redis.status).toBe('ok');
    expect(result.checks.btcWatcher.status).toBe('ok');
  });

  // The old endpoint returned a static {status:'ok'} and never touched
  // anything, so it stayed green with the database on the floor.
  it('fails when the database does not answer', async () => {
    const result = await makeUseCase({ db: false }).execute();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('fail');
  });

  it('fails when redis does not answer', async () => {
    const result = await makeUseCase({ cache: false }).execute();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis.status).toBe('fail');
  });

  // This endpoint is unauthenticated. A probe error can carry a connection
  // string, so only a fixed reason code ever leaves the process.
  it('never leaks the underlying error text', async () => {
    const result = await makeUseCase({ db: false }).execute();

    expect(JSON.stringify(result)).not.toMatch(/postgres:\/\/|connection refused/);
    expect(result.checks.database.reason).toBe('unreachable');
  });

  it('fails when the watcher has not reported within the stale window', async () => {
    const result = await makeUseCase({
      watcherLastSeen: new Date(NOW.getTime() - 200_000),
      staleAfterMs: 135_000,
    }).execute();

    expect(result.status).toBe('degraded');
    expect(result.checks.btcWatcher.status).toBe('fail');
    expect(result.checks.btcWatcher.reason).toBe('stale');
    expect(result.checks.btcWatcher.ageSeconds).toBe(200);
  });

  it('is still ok at the edge of the stale window', async () => {
    const result = await makeUseCase({
      watcherLastSeen: new Date(NOW.getTime() - 135_000),
      staleAfterMs: 135_000,
    }).execute();

    expect(result.checks.btcWatcher.status).toBe('ok');
  });

  // A watcher that has never run at all is the same operational fact as one
  // that stopped: nothing is watching the chain.
  it('fails when the watcher has never reported', async () => {
    const result = await makeUseCase({ watcherLastSeen: null }).execute();

    expect(result.status).toBe('degraded');
    expect(result.checks.btcWatcher.status).toBe('fail');
    expect(result.checks.btcWatcher.reason).toBe('never_reported');
    expect(result.checks.btcWatcher.ageSeconds).toBeNull();
  });
});
