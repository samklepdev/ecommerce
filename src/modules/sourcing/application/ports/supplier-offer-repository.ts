import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';

export interface SupplierOfferRepository {
  /** If `offer.isPreferred`, atomically clears any existing preferred offer
   * for the same product first (the DB also enforces this with a partial
   * unique index as a backstop). */
  create(offer: SupplierOffer): Promise<void>;
  setPreferred(offerId: string, productId: string): Promise<void>;
  updateCost(offerId: string, amountMinor: number, currency: string): Promise<void>;
  findPreferredByProductId(productId: string): Promise<SupplierOffer | null>;
  listByProductId(productId: string): Promise<SupplierOffer[]>;
  /** Offers for many products in one query — what the admin catalog table
   * needs. Asking per product was a round trip per row. */
  listByProductIds(productIds: string[]): Promise<SupplierOffer[]>;
}
