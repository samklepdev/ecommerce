import type { Product, ProductStatus } from '@/modules/catalog/domain/product';

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
  /** Null when the product no longer exists. Used both to reprice a cart
   * line and to render one — the product is the sellable unit, so there's
   * nothing narrower to look up. */
  findById(productId: string): Promise<Product | null>;
  /** Active-only; ids that don't resolve (deleted/archived/never existed)
   * are silently omitted, not errored. Returned order is not guaranteed to
   * match `ids`' order — callers that need a specific order must re-sort. */
  findByIds(ids: string[]): Promise<Product[]>;
  /** Admin-only — includes draft/archived products, not just active ones. */
  listAllForAdmin(): Promise<Product[]>;
  createProduct(product: Product): Promise<void>;
  updatePrice(productId: string, amountMinor: number, currency: string): Promise<void>;
  updateCategory(productId: string, category: string | null): Promise<void>;
  /** Slug is intentionally not editable here — it's permanent once created
   * so existing bookmarked/shared product URLs never break. */
  updateDetails(productId: string, details: { name: string; description: string | null }): Promise<void>;
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
  /** Cascades to the product's supplier offers. Fails (DB FK restrict) if
   * the product has ever been part of a real order — order history is never
   * deletable through this path. */
  deleteProduct(productId: string): Promise<void>;
}
