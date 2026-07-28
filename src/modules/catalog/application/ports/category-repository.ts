import type { Category } from '@/modules/catalog/domain/category';

export interface CategoryWithCount {
  category: Category;
  /** Products currently in it, any status. Drives the admin list and decides
   * what a delete or merge is about to move. */
  productCount: number;
}

export interface CategoryRepository {
  list(): Promise<Category[]>;
  listWithCounts(): Promise<CategoryWithCount[]>;
  findById(id: string): Promise<Category | null>;
  /** Resolves the storefront's `?category=` parameter. Matches the slug
   * first, then falls back to the name so links minted before categories
   * became an entity still work. */
  findBySlugOrName(value: string): Promise<Category | null>;
  findByName(name: string): Promise<Category | null>;
  create(category: Category): Promise<void>;
  update(category: Category): Promise<void>;
  /** Products in this category become uncategorized (the FK is ON DELETE SET
   * NULL) — a category is a label, and losing the label must not lose the
   * product. */
  delete(id: string): Promise<void>;
  /** Moves every product from one category to another and deletes the
   * source, in one transaction: a half-finished merge leaves products
   * pointing at a category the admin believes is gone. */
  merge(sourceId: string, targetId: string): Promise<void>;
}
