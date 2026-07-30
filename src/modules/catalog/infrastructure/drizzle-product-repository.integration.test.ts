import { describe, expect, it } from 'vitest';

import { DrizzleProductRepository } from './drizzle-product-repository';
import { makeCategory, makeProduct } from '../../../../tests/integration/factories';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * The active-only filter, against a real database.
 *
 * This is the pair that shipped a bug: `findById`/`findBySlug` are
 * customer-facing and must never return a draft or archived product, while
 * `findAny*` exist so admin screens can. A fake repository can't catch
 * getting that backwards, because the fake *is* the thing under test.
 */
describe('DrizzleProductRepository (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleProductRepository(db);

  describe('customer-facing lookups exclude anything not active', () => {
    it.each(['draft', 'archived'] as const)('findBySlug returns null for a %s product', async (status) => {
      const product = await makeProduct(db, { status });

      expect(await repo().findBySlug(product.slug)).toBeNull();
      // ...and the admin variant still finds it, which is the whole point of
      // there being two.
      expect((await repo().findAnyBySlug(product.slug))?.id).toBe(product.id);
    });

    it.each(['draft', 'archived'] as const)('findById returns null for a %s product', async (status) => {
      const product = await makeProduct(db, { status });

      expect(await repo().findById(product.id)).toBeNull();
      expect((await repo().findAnyById(product.id))?.id).toBe(product.id);
    });

    it('finds an active product by either lookup', async () => {
      const product = await makeProduct(db, { status: 'active' });

      expect((await repo().findBySlug(product.slug))?.id).toBe(product.id);
      expect((await repo().findById(product.id))?.id).toBe(product.id);
    });
  });

  describe('list', () => {
    it('returns only active products', async () => {
      await makeProduct(db, { status: 'active', name: 'Visible' });
      await makeProduct(db, { status: 'draft', name: 'Draft' });
      await makeProduct(db, { status: 'archived', name: 'Archived' });

      const listed = await repo().list();

      expect(listed.map((p) => p.name)).toEqual(['Visible']);
    });

    it('paginates in SQL rather than by loading the table', async () => {
      for (let i = 0; i < 5; i += 1) {
        await makeProduct(db, { name: `Product ${i}`, slug: `paged-${i}` });
      }

      const firstPage = await repo().list({ limit: 2 });
      const secondPage = await repo().list({ limit: 2, offset: 2 });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      // Distinct pages, not the same rows twice.
      const ids = new Set([...firstPage, ...secondPage].map((p) => p.id));
      expect(ids.size).toBe(4);
    });

    it('hydrates the category name that the storefront displays', async () => {
      const category = await makeCategory(db, { name: 'Hardware wallets' });
      await makeProduct(db, { categoryId: category.id });

      const [product] = await repo().list();

      expect(product!.category).toBe('Hardware wallets');
      expect(product!.categoryId).toBe(category.id);
    });

    it('filters by category slug and by category name, as the storefront does', async () => {
      const category = await makeCategory(db, { name: 'Seed backup', slug: 'seed-backup' });
      await makeProduct(db, { categoryId: category.id, name: 'In category' });
      await makeProduct(db, { name: 'Uncategorised' });

      const bySlug = await repo().list({ category: 'seed-backup' });
      const byName = await repo().list({ category: 'Seed backup' });

      expect(bySlug.map((p) => p.name)).toEqual(['In category']);
      expect(byName.map((p) => p.name)).toEqual(['In category']);
    });
  });

  describe('updateStatus', () => {
    it('moves a draft into the customer-facing result set', async () => {
      const product = await makeProduct(db, { status: 'draft' });
      expect(await repo().findById(product.id)).toBeNull();

      await repo().updateStatus(product.id, 'active');

      expect((await repo().findById(product.id))?.id).toBe(product.id);
    });
  });
});
