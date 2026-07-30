import { describe, expect, it } from 'vitest';

import { DrizzleSupplierRepository } from './drizzle-supplier-repository';
import {
  makeProduct,
  makeSupplier,
  makeSupplierOffer,
} from '../../../../tests/integration/factories';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * `getUsage` is what stands between an admin and deleting a supplier that
 * fulfilment still depends on, and miscounting it has shipped before. Both
 * counts are SQL, so this is where they can actually be wrong.
 */
describe('DrizzleSupplierRepository (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleSupplierRepository(db);

  describe('getUsage', () => {
    it('is zero for a supplier nothing references', async () => {
      const supplier = await makeSupplier(db);

      expect(await repo().getUsage(supplier.id)).toEqual({
        offerCount: 0,
        supplierOrderCount: 0,
      });
    });

    it('counts every offer that points at this supplier', async () => {
      const supplier = await makeSupplier(db);
      for (let i = 0; i < 3; i += 1) {
        const product = await makeProduct(db);
        await makeSupplierOffer(db, { productId: product.id, supplierId: supplier.id });
      }

      expect((await repo().getUsage(supplier.id)).offerCount).toBe(3);
    });

    it('counts only this supplier’s offers, not the whole table', async () => {
      const [mine, theirs] = [await makeSupplier(db), await makeSupplier(db)];
      const product = await makeProduct(db);
      await makeSupplierOffer(db, { productId: product.id, supplierId: mine.id });
      await makeSupplierOffer(db, { productId: product.id, supplierId: theirs.id });
      await makeSupplierOffer(db, { productId: product.id, supplierId: theirs.id });

      expect((await repo().getUsage(mine.id)).offerCount).toBe(1);
      expect((await repo().getUsage(theirs.id)).offerCount).toBe(2);
    });
  });

  describe('setActive', () => {
    it('deactivates without touching the offers that reference it', async () => {
      const supplier = await makeSupplier(db, { isActive: true });
      const product = await makeProduct(db);
      await makeSupplierOffer(db, { productId: product.id, supplierId: supplier.id });

      await repo().setActive(supplier.id, false);

      expect((await repo().findById(supplier.id))?.isActive).toBe(false);
      // Deactivating is meant to drop a supplier out of pickers, not to
      // break fulfilment for products already sourced from it.
      expect((await repo().getUsage(supplier.id)).offerCount).toBe(1);
    });
  });

  describe('delete', () => {
    it('removes a supplier nothing references', async () => {
      const supplier = await makeSupplier(db);

      await repo().delete(supplier.id);

      expect(await repo().findById(supplier.id)).toBeNull();
    });

    // ON DELETE RESTRICT is the backstop under DeleteSupplier's own check —
    // the database refusing is what makes the check a convenience rather
    // than the only thing standing in the way.
    it('is refused by the database while an offer still references it', async () => {
      const supplier = await makeSupplier(db);
      const product = await makeProduct(db);
      await makeSupplierOffer(db, { productId: product.id, supplierId: supplier.id });

      await expect(repo().delete(supplier.id)).rejects.toThrow();
      expect(await repo().findById(supplier.id)).not.toBeNull();
    });
  });
});
