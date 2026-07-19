import type { UseCase } from '@/shared/application/use-case';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface RemoveProductImageInput {
  imageId: string;
}

/** Removes one additional (non-primary) image. The primary `imageUrl` isn't
 * addressable here — replace it via a new upload/sync instead. */
export class RemoveProductImage implements UseCase<RemoveProductImageInput, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: RemoveProductImageInput): Promise<void> {
    await this.products.removeProductImage(input.imageId);
  }
}
