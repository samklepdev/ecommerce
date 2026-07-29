import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';

export interface SupplierOfferRepository {
  /** If `offer.isPreferred`, atomically clears any existing preferred offer
   * for the same product first (the DB also enforces this with a partial
   * unique index as a backstop). */
  create(offer: SupplierOffer): Promise<void>;
  setPreferred(offerId: string, productId: string): Promise<void>;
  updateCost(offerId: string, amountMinor: number, currency: string): Promise<void>;
  findPreferredByProductId(productId: string): Promise<SupplierOffer | null>;
  /**
   * The offer we would actually buy this product from: the preferred one, or
   * the oldest offer if nothing is flagged preferred.
   *
   * That fallback is the point. Having a supplier is the business rule —
   * *which* offer is preferred is bookkeeping, and a product with offers but
   * no flag set (which exists in production data) is a bookkeeping slip, not
   * a product with nowhere to buy it from. Keying fulfilment off
   * `findPreferredByProductId` alone turned that slip into an order that
   * could never be sourced, after the customer had paid.
   *
   * Availability is deliberately not considered here — an offer marked
   * unavailable is still a supplier, just out of stock. That distinction
   * belongs to the buy button, not to whether the product is sourceable.
   */
  findSourceableByProductId(productId: string): Promise<SupplierOffer | null>;
  listByProductId(productId: string): Promise<SupplierOffer[]>;
  /** Offers for many products in one query — what the admin catalog table
   * needs. Asking per product was a round trip per row. */
  listByProductIds(productIds: string[]): Promise<SupplierOffer[]>;
}
