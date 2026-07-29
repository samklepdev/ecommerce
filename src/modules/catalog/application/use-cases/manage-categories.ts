import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { Category } from '@/modules/catalog/domain/category';
import { Slug } from '@/modules/catalog/domain/slug';
import type {
  CategoryRepository,
  CategoryWithCount,
} from '@/modules/catalog/application/ports/category-repository';

/** The admin list: every category and how many products sit in it. */
export class ListCategories implements UseCase<void, CategoryWithCount[]> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(): Promise<CategoryWithCount[]> {
    return this.categories.listWithCounts();
  }
}

export interface CreateCategoryInput {
  name: string;
  description?: string | null;
}

export type CreateCategoryError =
  | { code: 'name_taken' }
  | { code: 'unsluggable_name' };

export class CreateCategory
  implements UseCase<CreateCategoryInput, Result<Category, CreateCategoryError>>
{
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: CreateCategoryInput): Promise<Result<Category, CreateCategoryError>> {
    const name = input.name.trim();
    if (await this.categories.findByName(name)) return err({ code: 'name_taken' });

    let slug: Slug;
    try {
      // A name of pure punctuation has no slug, and a category the storefront
      // can't link to isn't usable. Better to refuse it than to invent one.
      slug = Slug.fromName(name);
    } catch {
      return err({ code: 'unsluggable_name' });
    }

    const category = Category.create({
      id: randomUUID(),
      name,
      slug,
      description: input.description?.trim() || null,
    });
    await this.categories.create(category);
    return ok(category);
  }
}

export interface UpdateCategoryInput {
  id: string;
  name: string;
  description?: string | null;
}

export type UpdateCategoryError = { code: 'not_found' } | { code: 'name_taken' };

/** Renames a category, and this is the whole point of the entity: one write,
 * and every product in it follows. As a text column this was an UPDATE across
 * the catalog that silently missed any row spelled differently. */
export class UpdateCategory
  implements UseCase<UpdateCategoryInput, Result<Category, UpdateCategoryError>>
{
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: UpdateCategoryInput): Promise<Result<Category, UpdateCategoryError>> {
    const existing = await this.categories.findById(input.id);
    if (!existing) return err({ code: 'not_found' });

    const name = input.name.trim();
    const clash = await this.categories.findByName(name);
    if (clash && clash.id !== existing.id) return err({ code: 'name_taken' });

    const updated = existing.renamedTo(name).describedAs(input.description ?? null);
    await this.categories.update(updated);
    return ok(updated);
  }
}

export interface DeleteCategoryInput {
  id: string;
}

export type DeleteCategoryError = { code: 'not_found' };

export interface DeleteCategoryResult {
  /** How many products were left uncategorized — worth reporting back, since
   * it's the part of a delete that isn't obvious from the button. */
  uncategorized: number;
}

export class DeleteCategory
  implements UseCase<DeleteCategoryInput, Result<DeleteCategoryResult, DeleteCategoryError>>
{
  constructor(private readonly categories: CategoryRepository) {}

  async execute(
    input: DeleteCategoryInput,
  ): Promise<Result<DeleteCategoryResult, DeleteCategoryError>> {
    const withCounts = await this.categories.listWithCounts();
    const target = withCounts.find((c) => c.category.id === input.id);
    if (!target) return err({ code: 'not_found' });

    await this.categories.delete(input.id);
    return ok({ uncategorized: target.productCount });
  }
}

export interface MergeCategoriesInput {
  sourceId: string;
  targetId: string;
}

export type MergeCategoriesError =
  | { code: 'not_found' }
  | { code: 'same_category' };

export interface MergeCategoriesResult {
  moved: number;
  targetName: string;
}

/** Folds one category into another: every product moves, then the source is
 * deleted. The alternative — reassign by hand, then delete — leaves a window
 * where products point at a category the admin thinks is gone. */
export class MergeCategories
  implements UseCase<MergeCategoriesInput, Result<MergeCategoriesResult, MergeCategoriesError>>
{
  constructor(private readonly categories: CategoryRepository) {}

  async execute(
    input: MergeCategoriesInput,
  ): Promise<Result<MergeCategoriesResult, MergeCategoriesError>> {
    if (input.sourceId === input.targetId) return err({ code: 'same_category' });

    const withCounts = await this.categories.listWithCounts();
    const source = withCounts.find((c) => c.category.id === input.sourceId);
    const target = withCounts.find((c) => c.category.id === input.targetId);
    if (!source || !target) return err({ code: 'not_found' });

    await this.categories.merge(input.sourceId, input.targetId);
    return ok({ moved: source.productCount, targetName: target.category.name });
  }
}
