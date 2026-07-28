import { randomUUID } from 'node:crypto';

import { and, asc, count as countRows, desc, eq, exists, ilike, inArray, isNotNull, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { products, productImages, supplierOffers } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import {
  Product,
  type ProductImage,
  type ProductSource,
  type ProductStatus,
} from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import type {
  AdminCatalogCounts,
  AdminProductFilter,
  ListProductsParams,
  ProductRepository,
  ProductSort,
} from '@/modules/catalog/application/ports/product-repository';

type ProductRow = typeof products.$inferSelect;
type ProductImageRow = typeof productImages.$inferSelect;

function toProductImage(row: ProductImageRow): ProductImage {
  return { id: row.id, url: row.url, position: row.position };
}

function toProduct(row: ProductRow, additionalImages: ProductImage[]): Product {
  return Product.create({
    id: row.id,
    slug: Slug.create(row.slug),
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    additionalImages,
    status: row.status as ProductStatus,
    source: row.source as ProductSource,
    category: row.category,
    sku: row.sku,
    price: Money.of(row.unitAmountMinor, row.currency),
  });
}

function buildListFilter(params?: Pick<ListProductsParams, 'search' | 'category'>) {
  return and(
    eq(products.status, 'active'),
    params?.search ? ilike(products.name, `%${params.search}%`) : undefined,
    params?.category ? eq(products.category, params.category) : undefined,
  );
}

/** The supplier filter used to run in the page, over every product in the
 * catalog with one offers query per product behind it. As a WHERE EXISTS it
 * narrows before LIMIT, so the count and the page agree. */
function adminProductFilter(db: DB, filter: AdminProductFilter) {
  if (!filter.supplierId) return undefined;
  return exists(
    db
      .select({ one: sql`1` })
      .from(supplierOffers)
      .where(
        and(
          eq(supplierOffers.productId, products.id),
          eq(supplierOffers.supplierId, filter.supplierId),
        ),
      ),
  );
}

function buildOrderBy(sort: ProductSort | undefined) {
  switch (sort) {
    case 'name_asc':
      return [asc(products.name)];
    case 'name_desc':
      return [desc(products.name)];
    case 'price_asc':
      return [asc(products.unitAmountMinor)];
    case 'price_desc':
      return [desc(products.unitAmountMinor)];
    case 'newest':
    default:
      return [desc(products.createdAt)];
  }
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: DB) {}

  async findBySlug(slug: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({
      where: and(eq(products.slug, slug), eq(products.status, 'active')),
    });
    if (!row) return null;
    const images = await this.imagesFor([row.id]);
    return toProduct(row, images.get(row.id) ?? []);
  }

  async findAnyBySlug(slug: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({ where: eq(products.slug, slug) });
    if (!row) return null;
    const images = await this.imagesFor([row.id]);
    return toProduct(row, images.get(row.id) ?? []);
  }

  async list(params?: ListProductsParams): Promise<Product[]> {
    // Price sort used to need a LEFT JOIN + GROUP BY, because it ordered by
    // an aggregate over the product's variant rows. Price is a column on the
    // product itself now, so this is one ordinary query.
    const rows = await this.db
      .select()
      .from(products)
      .where(buildListFilter(params))
      .orderBy(...buildOrderBy(params?.sort))
      .limit(params?.limit ?? 50)
      .offset(params?.offset ?? 0);
    if (rows.length === 0) return [];

    const imagesByProduct = await this.imagesFor(rows.map((r) => r.id));
    return rows.map((row) => toProduct(row, imagesByProduct.get(row.id) ?? []));
  }

  async count(params?: Pick<ListProductsParams, 'search' | 'category'>): Promise<number> {
    const [row] = await this.db
      .select({ value: countRows() })
      .from(products)
      .where(buildListFilter(params));
    return row?.value ?? 0;
  }

  async listCategories(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ category: products.category })
      .from(products)
      .where(and(eq(products.status, 'active'), isNotNull(products.category)));
    return rows.map((r) => r.category).filter((c): c is string => c !== null).sort();
  }

  async findById(productId: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.status, 'active')),
    });
    if (!row) return null;
    const images = await this.imagesFor([row.id]);
    return toProduct(row, images.get(row.id) ?? []);
  }

  async findAnyById(productId: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({ where: eq(products.id, productId) });
    if (!row) return null;
    const images = await this.imagesFor([row.id]);
    return toProduct(row, images.get(row.id) ?? []);
  }

  async findAnyByIds(productIds: string[]): Promise<Product[]> {
    if (productIds.length === 0) return [];
    const rows = await this.db.query.products.findMany({
      where: inArray(products.id, productIds),
    });
    if (rows.length === 0) return [];

    const imagesByProduct = await this.imagesFor(rows.map((r) => r.id));
    return rows.map((row) => toProduct(row, imagesByProduct.get(row.id) ?? []));
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.query.products.findMany({
      where: and(inArray(products.id, ids), eq(products.status, 'active')),
    });
    if (rows.length === 0) return [];

    const imagesByProduct = await this.imagesFor(rows.map((r) => r.id));
    return rows.map((row) => toProduct(row, imagesByProduct.get(row.id) ?? []));
  }

  async listAllForAdmin(
    filter: AdminProductFilter,
    limit: number,
    offset: number,
  ): Promise<Product[]> {
    const rows = await this.db
      .select()
      .from(products)
      .where(adminProductFilter(this.db, filter))
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset);
    if (rows.length === 0) return [];

    const imagesByProduct = await this.imagesFor(rows.map((r) => r.id));
    return rows.map((row) => toProduct(row, imagesByProduct.get(row.id) ?? []));
  }

  async getAdminCatalogCounts(): Promise<AdminCatalogCounts> {
    const [row] = await this.db
      .select({
        total: countRows(),
        active: sql<number>`count(*) filter (where ${products.status} = 'active')`,
      })
      .from(products);
    return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0) };
  }

  async countAllForAdmin(filter: AdminProductFilter): Promise<number> {
    const [row] = await this.db
      .select({ value: countRows() })
      .from(products)
      .where(adminProductFilter(this.db, filter));
    return row?.value ?? 0;
  }

  async createProduct(product: Product): Promise<void> {
    await this.db.insert(products).values({
      id: product.id,
      slug: product.slug.value,
      name: product.name,
      description: product.description,
      status: product.status,
      source: product.source,
      category: product.category,
      sku: product.sku,
      unitAmountMinor: product.price.amountMinor,
      currency: product.price.currency,
    });
  }

  async updateCategory(productId: string, category: string | null): Promise<void> {
    await this.db
      .update(products)
      .set({ category, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }

  async updateDetails(
    productId: string,
    details: { name: string; description: string | null },
  ): Promise<void> {
    await this.db
      .update(products)
      .set({ name: details.name, description: details.description, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }

  async updatePrice(productId: string, amountMinor: number, currency: string): Promise<void> {
    await this.db
      .update(products)
      .set({ unitAmountMinor: amountMinor, currency, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }

  async updateImageUrl(productId: string, imageUrl: string): Promise<void> {
    await this.db
      .update(products)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }

  async addProductImage(productId: string, url: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await tx.query.products.findFirst({ where: eq(products.id, productId) });
      if (!row) throw new Error(`product ${productId} not found`);

      if (!row.imageUrl) {
        await tx
          .update(products)
          .set({ imageUrl: url, updatedAt: new Date() })
          .where(eq(products.id, productId));
        return;
      }

      const existing = await tx.query.productImages.findMany({
        where: eq(productImages.productId, productId),
      });
      const nextPosition = existing.reduce((max, i) => Math.max(max, i.position), 0) + 1;
      await tx.insert(productImages).values({
        id: randomUUID(),
        productId,
        url,
        position: nextPosition,
      });
    });
  }

  async removeProductImage(imageId: string): Promise<void> {
    await this.db.delete(productImages).where(eq(productImages.id, imageId));
  }

  async removePrimaryImage(productId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [nextImage] = await tx.query.productImages.findMany({
        where: eq(productImages.productId, productId),
        orderBy: (i, { asc }) => [asc(i.position)],
        limit: 1,
      });

      await tx
        .update(products)
        .set({ imageUrl: nextImage?.url ?? null, updatedAt: new Date() })
        .where(eq(products.id, productId));

      if (nextImage) {
        await tx.delete(productImages).where(eq(productImages.id, nextImage.id));
      }
    });
  }

  async updateStatus(productId: string, status: ProductStatus): Promise<void> {
    await this.db
      .update(products)
      .set({ status, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.db.delete(products).where(eq(products.id, productId));
  }

  private async imagesFor(productIds: string[]): Promise<Map<string, ProductImage[]>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.db.query.productImages.findMany({
      where: inArray(productImages.productId, productIds),
      orderBy: (i, { asc }) => [asc(i.position)],
    });
    const map = new Map<string, ProductImage[]>();
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(toProductImage(row));
      map.set(row.productId, list);
    }
    return map;
  }
}
