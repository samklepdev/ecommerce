import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ImageStorage } from '@/shared/application/ports/image-storage';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface AddProductImagesInput {
  productId: string;
  files: { buffer: Buffer; contentType: string }[];
}

export interface AddProductImagesResult {
  added: number;
  failed: number;
}

/** Stores admin-supplied image files directly, bypassing the supplier-fetch
 * path entirely — useful when a supplier's images are hotlink-protected or
 * otherwise unreachable from the server and the admin downloads them by hand.
 * The first image a product ever gets becomes its primary image; every
 * image after that is appended (in the order given) as an additional/hover
 * image — never overwrites what's already there. */
export class AddProductImages implements UseCase<AddProductImagesInput, AddProductImagesResult> {
  constructor(
    private readonly products: ProductRepository,
    private readonly imageStorage: ImageStorage,
  ) {}

  async execute(input: AddProductImagesInput): Promise<AddProductImagesResult> {
    let added = 0;
    let failed = 0;

    for (const file of input.files) {
      const storedImageUrl = await this.imageStorage.storeUploadedFile(file.buffer, file.contentType);
      if (!storedImageUrl) {
        failed += 1;
        logger.warn('add product images: rejected file', { productId: input.productId });
        continue;
      }

      try {
        await this.products.addProductImage(input.productId, storedImageUrl);
        added += 1;
      } catch (e) {
        failed += 1;
        logger.warn('add product images: failed to persist stored file', {
          productId: input.productId,
          storedImageUrl,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { added, failed };
  }
}
