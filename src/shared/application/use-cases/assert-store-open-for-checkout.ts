import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { StoreAvailabilityStore } from '@/shared/application/ports/store-availability';

/**
 * The authoritative half of the kill switch: may money move right now?
 *
 * The storefront's closed page is cosmetic — product pages are ISR, so a
 * cached one can be served without any layout of ours running, and a direct
 * POST to a server action never renders a page at all. This is the check
 * that actually holds, which is why it lives next to the money and not in
 * the UI.
 *
 * **Fails closed**, unlike `GetStoreAvailability`. If we can't read the
 * switch we don't take payments — and that costs nothing we weren't already
 * paying, because checkout can't function without Redis anyway: the BTC
 * address index is a Redis `INCR`, and handing out an address without it
 * would mean reusing one.
 */
export class AssertStoreOpenForCheckout implements UseCase<void, boolean> {
  constructor(private readonly store: StoreAvailabilityStore) {}

  async execute(): Promise<boolean> {
    try {
      return (await this.store.read()) === null;
    } catch (e) {
      logger.warn('could not read the store kill switch; refusing checkout', {
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }
}
