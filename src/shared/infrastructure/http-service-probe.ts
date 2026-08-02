import type { ServiceProbe } from '@/shared/application/ports/health-ports';
import { logger } from '@/shared/infrastructure/logger';

/**
 * A liveness probe against a third-party HTTP dependency, with the result
 * cached briefly.
 *
 * Caching is not an optimisation here, it is the point: a load balancer polls
 * `/api/health` every few seconds, and turning that into a matching stream of
 * requests to mempool.space would get the shop rate-limited by the very
 * service it is checking on — turning a monitoring feature into an outage.
 *
 * A short timeout for the same reason the chain and rate providers have one:
 * a health endpoint that can hang is worse than no health endpoint, because
 * the load balancer's own check times out and the instance is pulled.
 */
export class HttpServiceProbe implements ServiceProbe {
  private cached: { at: number; error: Error | null } | null = null;

  constructor(
    private readonly url: string,
    private readonly timeoutMs = 3_000,
    private readonly cacheMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async ping(): Promise<void> {
    const hit = this.cached;
    if (hit && this.now() - hit.at < this.cacheMs) {
      if (hit.error) throw hit.error;
      return;
    }

    try {
      const res = await fetch(this.url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Body drained rather than left dangling: an undici response whose body
      // is never read keeps its socket out of the pool.
      await res.arrayBuffer();
      this.cached = { at: this.now(), error: null };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.cached = { at: this.now(), error };
      logger.warn('dependency probe failed', { url: this.url, error: error.message });
      throw error;
    }
  }
}
