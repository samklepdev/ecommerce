import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';

export interface SupplierOfferRepository {
  /** If `offer.isPreferred`, atomically clears any existing preferred offer
   * for the same variant first (the DB also enforces this with a partial
   * unique index as a backstop). */
  create(offer: SupplierOffer): Promise<void>;
  setPreferred(offerId: string, variantId: string): Promise<void>;
  findPreferredByVariantId(variantId: string): Promise<SupplierOffer | null>;
  listByVariantId(variantId: string): Promise<SupplierOffer[]>;
}
