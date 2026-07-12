import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';
import type { SyncSupplierOffer } from '@/modules/sourcing/application/use-cases/sync-supplier-offer';

// Politeness delay between requests — this is on top of, not instead of,
// robots.txt compliance.
const REQUEST_SPACING_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs on the scheduled worker tick; finds offers due for sync and syncs
 * each one through the same SyncSupplierOffer the manual admin action uses. */
export class SyncAllDueSupplierOffers implements UseCase<void, void> {
  constructor(
    private readonly offers: SupplierOfferRepository,
    private readonly syncSupplierOffer: SyncSupplierOffer,
    private readonly intervalHours: number,
  ) {}

  async execute(): Promise<void> {
    const due = await this.offers.listDueForSync(this.intervalHours);
    logger.info('supplier sync pass starting', { dueCount: due.length });

    for (const offer of due) {
      try {
        await this.syncSupplierOffer.execute({ supplierOfferId: offer.id });
      } catch (e) {
        logger.error('supplier offer sync threw unexpectedly', {
          supplierOfferId: offer.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      await sleep(REQUEST_SPACING_MS);
    }
  }
}
