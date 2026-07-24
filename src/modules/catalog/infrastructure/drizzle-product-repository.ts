import { randomUUID } from 'node:crypto';

import { and, asc, count as countRows, desc, eq, ilike, inArray, isNotNull, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { products, productVariants, productImages } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import {
  Product,
  type ProductImage,
  type ProductSource,
  type ProductStatus,
} from '@/modules/catalog/domain/product';
import { ProductVariant } from '@/modules/catalog/domain/product-variant';
import { Slug } from '@/modules/catalog/domain/slug';
import type {
  ListProductsParams,
  ProductRepository,
  ProductSort,
} from '@/modules/catalog/application/ports/product-repository';

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;
type ProductImageRow = typeof productImages.$inferSelect;

function toVariant(row: VariantRow): ProductVariant {
  return ProductVariant.create({
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    price: Money.of(row.unitAmountMinor, row.currency),
  });
}

function toProductImage(row: ProductImageRow): ProductImage {
  return { id: row.id, url: row.url, position: row.position };
}

function toProduct(
  row: ProductRow,
  variants: ProductVariant[],
  additionalImages: ProductImage[],
): Product {
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
    variants,
  });
}

function buildListFilter(params?: Pick<ListProductsParams, 'search' | 'category'>) {
  return and(
    eq(products.status, 'active'),
    params?.search ? ilike(products.name, `%${params.search}%`) : undefined,
    params?.category ? eq(products.category, params.category) : undefined,
  );
}

// `Product` has no single canonical price (only variants[].price) — price
// sort uses the cheapest variant's price, via a LEFT JOIN + GROUP BY (see
// `listOrderedIds`), since today's catalog only ever has one variant per
// product in practice.
function buildOrderBy(sort: ProductSort | undefined) {
  switch (sort) {
    case 'name_asc':
      return [asc(products.name)];
    case 'name_desc':
      return [desc(products.name)];
    case 'price_asc':
      return [sql`MIN(${productVariants.unitAmountMinor}) ASC`];
    case 'price_desc':
      return [sql`MIN(${productVariants.unitAmountMinor}) DESC`];
    case 'newest':
    default:
      return [desc(products.createdAt)];
  }
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: DB) {}

  async findBySlug(slug: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({ where: eq(products.slug, slug) });
    if (!row) return null;
    const [variants, images] = await Promise.all([
      this.variantsFor([row.id]),
      this.imagesFor([row.id]),
    ]);
    return toProduct(row, variants.get(row.id) ?? [], images.get(row.id) ?? []);
  }

  async list(params?: ListProductsParams): Promise<Product[]> {
    // A plain LEFT JOIN + GROUP BY (rather than the relational query API's
    // `orderBy`) is needed for price sort, since it orders by an aggregate
    // over the joined product_variants rows — this determines the page of
    // ids/order; the actual product rows are still hydrated via the
    // existing relational-query path below, just re-ordered to match.
    const idRows = await this.db
      .select({ id: products.id })
      .from(products)
      .leftJoin(productVariants, eq(productVariants.productId, products.id))
      .where(buildListFilter(params))
      .groupBy(products.id)
      .orderBy(...buildOrderBy(params?.sort))
      .limit(params?.limit ?? 50)
      .offset(params?.offset ?? 0);

    const ids = idRows.map((r) => r.id);
    if (ids.length === 0) return [];

    const [rows, variantsByProduct, imagesByProduct] = await Promise.all([
      this.db.query.products.findMany({ where: inArray(products.id, ids) }),
      this.variantsFor(ids),
      this.imagesFor(ids),
    ]);
    const rowsById = new Map(rows.map((r) => [r.id, r]));

    return ids
      .map((id) => rowsById.get(id))
      .filter((row): row is ProductRow => row !== undefined)
      .map((row) => toProduct(row, variantsByProduct.get(row.id) ?? [], imagesByProduct.get(row.id) ?? []));
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

  async findVariantById(variantId: string): Promise<ProductVariant | null> {
    const row = await this.db.query.productVariants.findFirst({
      where: eq(productVariants.id, variantId),
    });
    return row ? toVariant(row) : null;
  }

  async findProductByVariantId(variantId: string): Promise<Product | null> {
    const variantRow = await this.db.query.productVariants.findFirst({
      where: eq(productVariants.id, variantId),
    });
    if (!variantRow) return null;

    const row = await this.db.query.products.findFirst({
      where: eq(products.id, variantRow.productId),
    });
    if (!row) return null;

    const [variants, images] = await Promise.all([
      this.variantsFor([row.id]),
      this.imagesFor([row.id]),
    ]);
    return toProduct(row, variants.get(row.id) ?? [], images.get(row.id) ?? []);
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.query.products.findMany({
      where: and(inArray(products.id, ids), eq(products.status, 'active')),
    });
    if (rows.length === 0) return [];

    const [variantsByProduct, imagesByProduct] = await Promise.all([
      this.variantsFor(rows.map((r) => r.id)),
      this.imagesFor(rows.map((r) => r.id)),
    ]);
    return rows.map((row) =>
      toProduct(row, variantsByProduct.get(row.id) ?? [], imagesByProduct.get(row.id) ?? []),
    );
  }

  async listAllForAdmin(): Promise<Product[]> {
    const rows = await this.db.query.products.findMany({
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });
    const [variantsByProduct, imagesByProduct] = await Promise.all([
      this.variantsFor(rows.map((r) => r.id)),
      this.imagesFor(rows.map((r) => r.id)),
    ]);
    return rows.map((row) =>
      toProduct(row, variantsByProduct.get(row.id) ?? [], imagesByProduct.get(row.id) ?? []),
    );
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

  async createVariant(variant: ProductVariant): Promise<void> {
    await this.db.insert(productVariants).values({
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      name: variant.name,
      unitAmountMinor: variant.price.amountMinor,
      currency: variant.price.currency,
    });
  }

  async updateVariantPrice(variantId: string, amountMinor: number, currency: string): Promise<void> {
    await this.db
      .update(productVariants)
      .set({ unitAmountMinor: amountMinor, currency })
      .where(eq(productVariants.id, variantId));
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

  private async variantsFor(productIds: string[]): Promise<Map<string, ProductVariant[]>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.db.query.productVariants.findMany({
      where: inArray(productVariants.productId, productIds),
    });
    const map = new Map<string, ProductVariant[]>();
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(toVariant(row));
      map.set(row.productId, list);
    }
    return map;
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
