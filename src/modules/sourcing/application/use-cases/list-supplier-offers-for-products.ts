import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface ListSupplierOffersForProductsInput {
  productIds: string[];
}

/** Offers for a page of products in one query, keyed by product id. The
 * admin catalog table needs every product's offers at once; asking per
 * product was one round trip per row. */
export class ListSupplierOffersForProducts
  implements UseCase<ListSupplierOffersForProductsInput, Map<string, SupplierOffer[]>>
{
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: ListSupplierOffersForProductsInput): Promise<Map<string, SupplierOffer[]>> {
    const byProduct = new Map<string, SupplierOffer[]>();
    if (input.productIds.length === 0) return byProduct;

    for (const offer of await this.offers.listByProductIds(input.productIds)) {
      const existing = byProduct.get(offer.productId);
      if (existing) existing.push(offer);
      else byProduct.set(offer.productId, [offer]);
    }
    return byProduct;
  }
}
