import type { Product, ProductStatus } from '@/modules/catalog/domain/product';

export type ProductSort = 'newest' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';

export interface ListProductsParams {
  search?: string;
  /** A category slug or display name — both resolve to the same category. */
  category?: string;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}

/** Narrows the admin catalog list. Shared by the list and its count so the
 * two can't report different totals. */
export interface AdminProductFilter {
  /** Only products with an offer from this supplier. */
  supplierId?: string;
}

export interface AdminCatalogCounts {
  total: number;
  active: number;
}

export interface ProductRepository {
  /** Active-only. A draft or archived product reads as gone here, exactly
   * like one that never existed — this is what the public product page
   * resolves through, so an unpublished product is not viewable. Callers
   * that must see every status use `findAnyBySlug`. */
  findBySlug(slug: string): Promise<Product | null>;
  /** Any status, including draft and archived. Admin and internal callers
   * only — never reachable from a storefront page. */
  findAnyBySlug(slug: string): Promise<Product | null>;
  list(params?: ListProductsParams): Promise<Product[]>;
  /** Total matching `search`/`category` (ignores `limit`/`offset`) — for
   * pagination. */
  count(params?: Pick<ListProductsParams, 'search' | 'category'>): Promise<number>;
  /** Distinct, non-null categories among active products — the filter
   * dropdown's options. */
  listCategories(): Promise<string[]>;
  /** Active-only, same contract as `findBySlug`: null when the product no
   * longer exists *or* is not published. Used to reprice a cart line, to
   * render one, and by `PlaceOrder` — so a product pulled from the catalog
   * mid-session becomes `product_unavailable` rather than something a
   * customer can still buy. Admin callers use `findAnyById`. */
  findById(productId: string): Promise<Product | null>;
  /** Any status, including draft and archived. Admin and internal callers
   * only — never reachable from a storefront page. */
  findAnyById(productId: string): Promise<Product | null>;
  /** Batch form of `findAnyById`, for admin screens that need names for a
   * set of product ids they already hold. */
  findAnyByIds(productIds: string[]): Promise<Product[]>;
  /** Active-only; ids that don't resolve (deleted/archived/never existed)
   * are silently omitted, not errored. Returned order is not guaranteed to
   * match `ids`' order — callers that need a specific order must re-sort. */
  findByIds(ids: string[]): Promise<Product[]>;
  /** Admin-only — includes draft/archived products, not just active ones.
   * One page, newest first, sliced in SQL. */
  listAllForAdmin(filter: AdminProductFilter, limit: number, offset: number): Promise<Product[]>;
  countAllForAdmin(filter: AdminProductFilter): Promise<number>;
  /** Catalog size and how much of it is live, in one query — the admin
   * header's summary line. */
  getAdminCatalogCounts(): Promise<AdminCatalogCounts>;
  createProduct(product: Product): Promise<void>;
  updatePrice(productId: string, amountMinor: number, currency: string): Promise<void>;
  /** Null uncategorizes the product. Takes the category's **id** — names
   * stopped being the identity when categories became a table. */
  updateCategory(productId: string, categoryId: string | null): Promise<void>;
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
