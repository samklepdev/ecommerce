import type { Product } from '@/modules/catalog/domain/product';
import type { ProductVariant } from '@/modules/catalog/domain/product-variant';

export interface ProductRepository {
  findBySlug(slug: string): Promise<Product | null>;
  list(params?: { limit?: number; offset?: number }): Promise<Product[]>;
  findVariantById(variantId: string): Promise<ProductVariant | null>;
  /** Admin-only — includes draft/archived products, not just active ones. */
  listAllForAdmin(): Promise<Product[]>;
  createProduct(product: Product): Promise<void>;
  createVariant(variant: ProductVariant): Promise<void>;
  updateImageUrl(productId: string, imageUrl: string): Promise<void>;
}
