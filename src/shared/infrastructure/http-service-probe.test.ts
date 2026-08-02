import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpServiceProbe } from './http-service-probe';

describe('HttpServiceProbe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFetch(responses: (number | 'throw')[]) {
    let i = 0;
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      // Clamped to the last entry, so a probe called more times than the
      // script has responses keeps returning the final one.
      const r = responses[Math.min(i, responses.length - 1)] ?? 200;
      i += 1;
      if (r === 'throw') throw new Error('ECONNREFUSED');
      return { ok: r < 400, status: r, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    });
    return calls;
  }

  it('resolves when the service answers', async () => {
    stubFetch([200]);
    await expect(new HttpServiceProbe('https://svc.test/ping').ping()).resolves.toBeUndefined();
  });

  it('throws on an error status', async () => {
    stubFetch([503]);
    await expect(new HttpServiceProbe('https://svc.test/ping').ping()).rejects.toThrow(/503/);
  });

  it('throws when the connection fails', async () => {
    stubFetch(['throw']);
    await expect(new HttpServiceProbe('https://svc.test/ping').ping()).rejects.toThrow(/ECONN/);
  });

  /**
   * The property that stops a monitoring feature becoming an outage: a load
   * balancer polls `/api/health` every few seconds, and without caching every
   * one of those polls would hit mempool.space — getting the shop rate-limited
   * by the very service it is checking on.
   */
  it('does not re-probe within the cache window', async () => {
    const calls = stubFetch([200]);
    let now = 1_000;
    const probe = new HttpServiceProbe('https://svc.test/ping', 3_000, 30_000, () => now);

    await probe.ping();
    now += 5_000;
    await probe.ping();
    now += 5_000;
    await probe.ping();

    expect(calls).toHaveLength(1);
  });

  it('re-probes once the cache window has passed', async () => {
    const calls = stubFetch([200]);
    let now = 1_000;
    const probe = new HttpServiceProbe('https://svc.test/ping', 3_000, 30_000, () => now);

    await probe.ping();
    now += 31_000;
    await probe.ping();

    expect(calls).toHaveLength(2);
  });

  it('caches a failure too, so an outage is not amplified into a stampede', async () => {
    // A service that is down is precisely the one that must not be hammered.
    const calls = stubFetch(['throw']);
    let now = 1_000;
    const probe = new HttpServiceProbe('https://svc.test/ping', 3_000, 30_000, () => now);

    await expect(probe.ping()).rejects.toThrow();
    now += 5_000;
    await expect(probe.ping()).rejects.toThrow();

    expect(calls).toHaveLength(1);
  });

  it('recovers once the service comes back', async () => {
    const calls = stubFetch(['throw', 200]);
    let now = 1_000;
    const probe = new HttpServiceProbe('https://svc.test/ping', 3_000, 30_000, () => now);

    await expect(probe.ping()).rejects.toThrow();
    now += 31_000;

    await expect(probe.ping()).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });
});
