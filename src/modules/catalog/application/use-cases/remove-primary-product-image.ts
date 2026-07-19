import type { UseCase } from '@/shared/application/use-case';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface RemovePrimaryProductImageInput {
  productId: string;
}

/** Removes a product's primary image. The earliest additional image, if any,
 * is promoted to take its place — mirroring how the first upload becomes the
 * primary image in `AddProductImages`. */
export class RemovePrimaryProductImage implements UseCase<RemovePrimaryProductImageInput, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: RemovePrimaryProductImageInput): Promise<void> {
    await this.products.removePrimaryImage(input.productId);
  }
}
