import { eq, inArray } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { products, productVariants } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import { Product, type ProductStatus } from '@/modules/catalog/domain/product';
import { ProductVariant } from '@/modules/catalog/domain/product-variant';
import { Slug } from '@/modules/catalog/domain/slug';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

function toVariant(row: VariantRow): ProductVariant {
  return ProductVariant.create({
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    price: Money.of(row.unitAmountMinor, row.currency),
  });
}

function toProduct(row: ProductRow, variants: ProductVariant[]): Product {
  return Product.create({
    id: row.id,
    slug: Slug.create(row.slug),
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    status: row.status as ProductStatus,
    variants,
  });
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: DB) {}

  async findBySlug(slug: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({ where: eq(products.slug, slug) });
    if (!row) return null;
    const variants = await this.variantsFor([row.id]);
    return toProduct(row, variants.get(row.id) ?? []);
  }

  async list(params?: { limit?: number; offset?: number }): Promise<Product[]> {
    const rows = await this.db.query.products.findMany({
      where: eq(products.status, 'active'),
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
    });
    const variantsByProduct = await this.variantsFor(rows.map((r) => r.id));
    return rows.map((row) => toProduct(row, variantsByProduct.get(row.id) ?? []));
  }

  async findVariantById(variantId: string): Promise<ProductVariant | null> {
    const row = await this.db.query.productVariants.findFirst({
      where: eq(productVariants.id, variantId),
    });
    return row ? toVariant(row) : null;
  }

  async listAllForAdmin(): Promise<Product[]> {
    const rows = await this.db.query.products.findMany();
    const variantsByProduct = await this.variantsFor(rows.map((r) => r.id));
    return rows.map((row) => toProduct(row, variantsByProduct.get(row.id) ?? []));
  }

  async createProduct(product: Product): Promise<void> {
    await this.db.insert(products).values({
      id: product.id,
      slug: product.slug.value,
      name: product.name,
      description: product.description,
      status: product.status,
    });
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

  async updateImageUrl(productId: string, imageUrl: string): Promise<void> {
    await this.db
      .update(products)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(products.id, productId));
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
}
