import { describe, expect, it } from 'vitest';

import {
  CreateCategory,
  UpdateCategory,
  DeleteCategory,
  MergeCategories,
} from './manage-categories';
import { Category } from '@/modules/catalog/domain/category';
import { Slug } from '@/modules/catalog/domain/slug';
import { isErr, isOk } from '@/shared/domain/result';
import type {
  CategoryRepository,
  CategoryWithCount,
} from '@/modules/catalog/application/ports/category-repository';

function makeCategory(id: string, name: string) {
  return Category.create({ id, name, slug: Slug.fromName(name), description: null });
}

function makeFakeRepo(seed: CategoryWithCount[] = []) {
  const state = [...seed];
  const merges: { sourceId: string; targetId: string }[] = [];
  const deletes: string[] = [];
  const writes: Category[] = [];

  const repo: CategoryRepository = {
    async list() {
      return state.map((c) => c.category);
    },
    async listWithCounts() {
      return state;
    },
    async findById(id) {
      return state.find((c) => c.category.id === id)?.category ?? null;
    },
    async findBySlugOrName(value) {
      return (
        state.find((c) => c.category.slug.value === value || c.category.name === value)?.category ??
        null
      );
    },
    async findByName(name) {
      return state.find((c) => c.category.name === name)?.category ?? null;
    },
    async create(category) {
      writes.push(category);
      state.push({ category, productCount: 0 });
    },
    async update(category) {
      writes.push(category);
    },
    async delete(id) {
      deletes.push(id);
    },
    async merge(sourceId, targetId) {
      merges.push({ sourceId, targetId });
    },
  };
  return { repo, merges, deletes, writes };
}

describe('CreateCategory', () => {
  it('derives the slug from the name', async () => {
    const { repo, writes } = makeFakeRepo();

    const result = await new CreateCategory(repo).execute({ name: '  Hardware Wallets  ' });

    expect(isOk(result)).toBe(true);
    expect(writes[0]?.name).toBe('Hardware Wallets');
    expect(writes[0]?.slug.value).toBe('hardware-wallets');
  });

  it('refuses a duplicate name', async () => {
    const { repo, writes } = makeFakeRepo([
      { category: makeCategory('c1', 'Accessories'), productCount: 3 },
    ]);

    const result = await new CreateCategory(repo).execute({ name: 'Accessories' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('name_taken');
    expect(writes).toHaveLength(0);
  });

  // A category the storefront can't build a link to isn't usable.
  it('refuses a name with no slug in it', async () => {
    const { repo, writes } = makeFakeRepo();

    const result = await new CreateCategory(repo).execute({ name: '???' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('unsluggable_name');
    expect(writes).toHaveLength(0);
  });
});

describe('UpdateCategory', () => {
  // The entire point of the entity: one write, and every product follows.
  it('renames without touching any product', async () => {
    const { repo, writes } = makeFakeRepo([
      { category: makeCategory('c1', 'Hardware wallets'), productCount: 12 },
    ]);

    const result = await new UpdateCategory(repo).execute({ id: 'c1', name: 'Signing devices' });

    expect(isOk(result)).toBe(true);
    expect(writes[0]?.name).toBe('Signing devices');
  });

  // Links pointing at the old slug keep working; a stale slug beats a broken
  // link, and it's the same rule Product already applies to its own.
  it('keeps the original slug across a rename', async () => {
    const { repo, writes } = makeFakeRepo([
      { category: makeCategory('c1', 'Hardware wallets'), productCount: 1 },
    ]);

    await new UpdateCategory(repo).execute({ id: 'c1', name: 'Signing devices' });

    expect(writes[0]?.slug.value).toBe('hardware-wallets');
  });

  it('refuses to rename onto another category', async () => {
    const { repo, writes } = makeFakeRepo([
      { category: makeCategory('c1', 'Hardware wallets'), productCount: 1 },
      { category: makeCategory('c2', 'Accessories'), productCount: 1 },
    ]);

    const result = await new UpdateCategory(repo).execute({ id: 'c1', name: 'Accessories' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('name_taken');
    expect(writes).toHaveLength(0);
  });

  it('allows saving a category under its own name', async () => {
    const { repo } = makeFakeRepo([
      { category: makeCategory('c1', 'Accessories'), productCount: 1 },
    ]);

    const result = await new UpdateCategory(repo).execute({
      id: 'c1',
      name: 'Accessories',
      description: 'Cables, cases, spares',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.description).toBe('Cables, cases, spares');
  });
});

describe('DeleteCategory', () => {
  // Deleting a label must never delete what it labelled.
  it('reports how many products it left uncategorized', async () => {
    const { repo, deletes } = makeFakeRepo([
      { category: makeCategory('c1', 'Accessories'), productCount: 7 },
    ]);

    const result = await new DeleteCategory(repo).execute({ id: 'c1' });

    expect(deletes).toEqual(['c1']);
    if (isOk(result)) expect(result.value.uncategorized).toBe(7);
  });

  it('reports a category that is already gone', async () => {
    const { repo, deletes } = makeFakeRepo();

    const result = await new DeleteCategory(repo).execute({ id: 'nope' });

    expect(isErr(result)).toBe(true);
    expect(deletes).toHaveLength(0);
  });
});

describe('MergeCategories', () => {
  it('folds the source into the target and reports what moved', async () => {
    const { repo, merges } = makeFakeRepo([
      { category: makeCategory('c1', 'Wallets'), productCount: 4 },
      { category: makeCategory('c2', 'Hardware wallets'), productCount: 9 },
    ]);

    const result = await new MergeCategories(repo).execute({ sourceId: 'c1', targetId: 'c2' });

    expect(merges).toEqual([{ sourceId: 'c1', targetId: 'c2' }]);
    if (isOk(result)) expect(result.value).toEqual({ moved: 4, targetName: 'Hardware wallets' });
  });

  it('refuses to merge a category into itself', async () => {
    const { repo, merges } = makeFakeRepo([
      { category: makeCategory('c1', 'Wallets'), productCount: 4 },
    ]);

    const result = await new MergeCategories(repo).execute({ sourceId: 'c1', targetId: 'c1' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('same_category');
    expect(merges).toHaveLength(0);
  });

  it('refuses when either side no longer exists', async () => {
    const { repo, merges } = makeFakeRepo([
      { category: makeCategory('c1', 'Wallets'), productCount: 4 },
    ]);

    const result = await new MergeCategories(repo).execute({ sourceId: 'c1', targetId: 'gone' });

    expect(isErr(result)).toBe(true);
    expect(merges).toHaveLength(0);
  });
});
