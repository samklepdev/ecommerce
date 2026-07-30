import { describe, expect, it } from 'vitest';

import { DrizzleSupplierOfferRepository } from './drizzle-supplier-offer-repository';
import {
  makeProduct,
  makeSupplier,
  makeSupplierOffer,
} from '../../../../tests/integration/factories';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * `findSourceableByProductId` decides where a paid order gets bought from,
 * and its whole reason to exist — falling back to the oldest offer when
 * nothing is flagged preferred — lives in SQL. A fake repository would just
 * be a second implementation of the rule, so this is the only place the real
 * one is exercised.
 */
describe('DrizzleSupplierOfferRepository (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleSupplierOfferRepository(db);

  it('returns the preferred offer when one is flagged', async () => {
    const product = await makeProduct(db);
    const supplier = await makeSupplier(db);
    const older = await makeSupplierOffer(db, {
      productId: product.id,
      supplierId: supplier.id,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const preferred = await makeSupplierOffer(db, {
      productId: product.id,
      supplierId: supplier.id,
      isPreferred: true,
      createdAt: new Date('2026-06-01T00:00:00Z'),
    });

    const chosen = await repo().findSourceableByProductId(product.id);

    // Preferred beats older — the flag is the primary sort, not the date.
    expect(chosen?.id).toBe(preferred.id);
    expect(chosen?.id).not.toBe(older.id);
  });

  // The production data that prompted this method: offers exist, none is
  // flagged. Keying fulfilment off the flag alone stranded the order.
  it('falls back to the oldest offer when nothing is preferred', async () => {
    const product = await makeProduct(db);
    const supplier = await makeSupplier(db);
    const oldest = await makeSupplierOffer(db, {
      productId: product.id,
      supplierId: supplier.id,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await makeSupplierOffer(db, {
      productId: product.id,
      supplierId: supplier.id,
      createdAt: new Date('2026-03-01T00:00:00Z'),
    });

    expect((await repo().findSourceableByProductId(product.id))?.id).toBe(oldest.id);
  });

  it('returns an unavailable offer rather than nothing — out of stock is still a supplier', async () => {
    const product = await makeProduct(db);
    const supplier = await makeSupplier(db);
    const offer = await makeSupplierOffer(db, {
      productId: product.id,
      supplierId: supplier.id,
      isPreferred: true,
      isAvailable: false,
    });

    const chosen = await repo().findSourceableByProductId(product.id);

    expect(chosen?.id).toBe(offer.id);
    expect(chosen?.isAvailable).toBe(false);
  });

  it('returns null when the product has no offers at all', async () => {
    const product = await makeProduct(db);

    expect(await repo().findSourceableByProductId(product.id)).toBeNull();
  });

  it('never returns another product’s offer', async () => {
    const [mine, theirs] = [await makeProduct(db), await makeProduct(db)];
    const supplier = await makeSupplier(db);
    await makeSupplierOffer(db, { productId: theirs.id, supplierId: supplier.id, isPreferred: true });

    expect(await repo().findSourceableByProductId(mine.id)).toBeNull();
  });

  describe('create', () => {
    it('clears the previous preferred offer when a new preferred one arrives', async () => {
      const product = await makeProduct(db);
      const supplier = await makeSupplier(db);
      const first = await makeSupplierOffer(db, {
        productId: product.id,
        supplierId: supplier.id,
        isPreferred: true,
      });

      // Through the repository this time — the atomic swap is the behaviour
      // under test, and the DB's partial unique index is the backstop.
      const offers = await repo().listByProductId(product.id);
      expect(offers.filter((o) => o.isPreferred)).toHaveLength(1);

      await repo().setPreferred(
        (await makeSupplierOffer(db, { productId: product.id, supplierId: supplier.id })).id,
        product.id,
      );

      const after = await repo().listByProductId(product.id);
      expect(after.filter((o) => o.isPreferred)).toHaveLength(1);
      expect(after.find((o) => o.isPreferred)?.id).not.toBe(first.id);
    });
  });
});
