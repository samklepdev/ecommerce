import { headers } from 'next/headers';

import { logger } from '@/shared/infrastructure/logger';

import type {
  RequestContextProvider,
  RequestOrigin,
} from '@/modules/audit/application/ports/request-context';

/** Same header precedence as the analytics client-IP resolution: the first
 * hop in `x-forwarded-for` is the client, everything after it is proxies. */
export class NextRequestContext implements RequestContextProvider {
  async current(): Promise<RequestOrigin> {
    try {
      const h = await headers();
      const forwarded = h.get('x-forwarded-for');
      const ipAddress =
        forwarded?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null;
      return { ipAddress, userAgent: h.get('user-agent') };
    } catch (e) {
      // Outside a request — the worker, or a script. An audit entry without
      // an origin is still worth recording; a failed one isn't. Logged
      // rather than swallowed: silently anonymous entries look identical to
      // correct ones, which is how this failing goes unnoticed.
      logger.warn('audit: could not read request origin', {
        error: e instanceof Error ? e.message : String(e),
      });
      return { ipAddress: null, userAgent: null };
    }
  }
}
