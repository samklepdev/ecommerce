import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { StoreAvailabilityStore, StoreClosure } from '@/shared/application/ports/store-availability';

export interface StoreAvailability {
  isOpen: boolean;
  closure: StoreClosure | null;
}

/**
 * Reads the kill switch for anything that renders — the storefront layout,
 * the admin toggle's current state, `/api/health`.
 *
 * **Fails open**, deliberately, and this is the opposite of what
 * `AssertStoreOpenForCheckout` does. Two reasons:
 *
 * 1. A Redis blip must not take a browsable catalogue offline. Nothing is at
 *    risk from someone reading a product page, and closing the shop because
 *    a cache hiccuped is an outage we'd have caused ourselves.
 * 2. This runs during `next build`'s static generation, where Redis is
 *    intentionally absent (`lazyConnect` exists for exactly that). Failing
 *    closed here would bake a "closed" page into the build output.
 *
 * Nothing that moves money trusts this answer — the checkout guard reads the
 * switch again and fails the other way.
 */
export class GetStoreAvailability implements UseCase<void, StoreAvailability> {
  constructor(private readonly store: StoreAvailabilityStore) {}

  async execute(): Promise<StoreAvailability> {
    try {
      const closure = await this.store.read();
      return { isOpen: closure === null, closure };
    } catch (e) {
      logger.warn('could not read the store kill switch; treating the store as open', {
        error: e instanceof Error ? e.message : String(e),
      });
      return { isOpen: true, closure: null };
    }
  }
}
