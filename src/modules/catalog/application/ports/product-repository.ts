import type { Product, ProductStatus } from '@/modules/catalog/domain/product';
import type { ProductVariant } from '@/modules/catalog/domain/product-variant';

export type ProductSort = 'newest' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';

export interface ListProductsParams {
  search?: string;
  category?: string;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}

export interface ProductRepository {
  findBySlug(slug: string): Promise<Product | null>;
  list(params?: ListProductsParams): Promise<Product[]>;
  /** Total matching `search`/`category` (ignores `limit`/`offset`) — for
   * pagination. */
  count(params?: Pick<ListProductsParams, 'search' | 'category'>): Promise<number>;
  /** Distinct, non-null categories among active products — the filter
   * dropdown's options. */
  listCategories(): Promise<string[]>;
  findVariantById(variantId: string): Promise<ProductVariant | null>;
  /** Admin-only — includes draft/archived products, not just active ones. */
  listAllForAdmin(): Promise<Product[]>;
  createProduct(product: Product): Promise<void>;
  createVariant(variant: ProductVariant): Promise<void>;
  updateVariantPrice(variantId: string, amountMinor: number, currency: string): Promise<void>;
  updateCategory(productId: string, category: string | null): Promise<void>;
  updateImageUrl(productId: string, imageUrl: string): Promise<void>;
  /** Sets the product's primary image if it doesn't have one yet; otherwise
   * appends an additional (e.g. hover) image at the next position. */
  addProductImage(productId: string, url: string): Promise<void>;
  removeProductImage(imageId: string): Promise<void>;
  /** Clears the primary image. If an additional image exists, the earliest
   * (lowest position) one is promoted to take its place; otherwise the
   * product is left with no image. */
  removePrimaryImage(productId: string): Promise<void>;
  updateStatus(productId: string, status: ProductStatus): Promise<void>;
  /** Cascades to the product's variants and their supplier offers. Fails (DB
   * FK restrict) if any variant has ever been part of a real order — order
   * history is never deletable through this path. */
  deleteProduct(productId: string): Promise<void>;
}
