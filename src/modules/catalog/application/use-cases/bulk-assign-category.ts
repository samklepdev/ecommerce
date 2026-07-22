import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface BulkAssignCategoryInput {
  productIds: string[];
  category: string | null;
}

export interface BulkAssignCategoryResult {
  updated: number;
  failed: number;
}

/** Same per-id try/catch + counters shape as `PublishProducts`/`DeleteProducts`. */
export class BulkAssignCategory implements UseCase<BulkAssignCategoryInput, BulkAssignCategoryResult> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: BulkAssignCategoryInput): Promise<BulkAssignCategoryResult> {
    let updated = 0;
    let failed = 0;

    for (const productId of input.productIds) {
      try {
        await this.products.updateCategory(productId, input.category);
        updated += 1;
      } catch (e) {
        failed += 1;
        logger.warn('failed to assign category to product', {
          productId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { updated, failed };
  }
}
