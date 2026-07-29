import { count as countRows, eq, or, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { categories, products } from '@/shared/infrastructure/db/schema';
import { Category } from '@/modules/catalog/domain/category';
import { Slug } from '@/modules/catalog/domain/slug';
import type {
  CategoryRepository,
  CategoryWithCount,
} from '@/modules/catalog/application/ports/category-repository';

type CategoryRow = typeof categories.$inferSelect;

function toCategory(row: CategoryRow): Category {
  return Category.create({
    id: row.id,
    name: row.name,
    slug: Slug.create(row.slug),
    description: row.description,
  });
}

export class DrizzleCategoryRepository implements CategoryRepository {
  constructor(private readonly db: DB) {}

  async list(): Promise<Category[]> {
    const rows = await this.db.query.categories.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
    });
    return rows.map(toCategory);
  }

  async listWithCounts(): Promise<CategoryWithCount[]> {
    // One grouped count joined onto the list, not a query per category.
    const rows = await this.db
      .select({ category: categories, productCount: countRows(products.id) })
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(categories.name);

    return rows.map((r) => ({
      category: toCategory(r.category),
      productCount: Number(r.productCount ?? 0),
    }));
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.db.query.categories.findFirst({ where: eq(categories.id, id) });
    return row ? toCategory(row) : null;
  }

  async findBySlugOrName(value: string): Promise<Category | null> {
    // Slug first, name second: links minted before categories became an
    // entity carry the display name in ?category=, and they still work.
    const row = await this.db.query.categories.findFirst({
      where: or(eq(categories.slug, value), eq(categories.name, value)),
    });
    return row ? toCategory(row) : null;
  }

  async findByName(name: string): Promise<Category | null> {
    const row = await this.db.query.categories.findFirst({
      where: eq(categories.name, name),
    });
    return row ? toCategory(row) : null;
  }

  async create(category: Category): Promise<void> {
    await this.db.insert(categories).values({
      id: category.id,
      name: category.name,
      slug: category.slug.value,
      description: category.description,
    });
  }

  async update(category: Category): Promise<void> {
    await this.db
      .update(categories)
      .set({
        name: category.name,
        slug: category.slug.value,
        description: category.description,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, category.id));
  }

  async delete(id: string): Promise<void> {
    // Products fall back to uncategorized via ON DELETE SET NULL.
    await this.db.delete(categories).where(eq(categories.id, id));
  }

  async merge(sourceId: string, targetId: string): Promise<void> {
    // One transaction: a half-done merge leaves products pointing at a
    // category the admin has been told is gone.
    await this.db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ categoryId: targetId, updatedAt: new Date() })
        .where(eq(products.categoryId, sourceId));
      await tx.delete(categories).where(eq(categories.id, sourceId));
    });
  }

  /** Products in a category, for callers that only need the number. */
  async countProducts(categoryId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: countRows() })
      .from(products)
      .where(eq(products.categoryId, categoryId));
    return Number(row?.value ?? 0);
  }

  /** Escape hatch used by the admin bulk-assign action, which addresses
   * categories by name because that's what its <select> carries. */
  async idForName(name: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(sql`lower(${categories.name}) = lower(${name})`);
    return row?.id ?? null;
  }
}
