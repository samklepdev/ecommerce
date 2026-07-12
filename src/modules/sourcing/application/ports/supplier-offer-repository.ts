import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { ScrapedListing } from '@/modules/sourcing/application/ports/supplier-page-fetcher';

export interface SupplierOfferRepository {
  /** If `offer.isPreferred`, atomically clears any existing preferred offer
   * for the same variant first (the DB also enforces this with a partial
   * unique index as a backstop). */
  create(offer: SupplierOffer): Promise<void>;
  setPreferred(offerId: string, variantId: string): Promise<void>;
  findPreferredByVariantId(variantId: string): Promise<SupplierOffer | null>;
  listByVariantId(variantId: string): Promise<SupplierOffer[]>;
  findById(offerId: string): Promise<SupplierOffer | null>;
  /** Offers with auto-sync enabled whose last sync (or never-synced) is older
   * than `intervalHours`. */
  listDueForSync(intervalHours: number): Promise<SupplierOffer[]>;
  setAutoSyncEnabled(offerId: string, enabled: boolean): Promise<void>;
  recordSyncSuccess(offerId: string, listing: ScrapedListing): Promise<void>;
  recordSyncFailure(
    offerId: string,
    status: 'blocked' | 'error',
    message: string,
  ): Promise<void>;
}
