import { randomUUID } from 'node:crypto';
import type { drizzle } from 'drizzle-orm/postgres-js';

import {
  categories,
  products,
  supplierOffers,
  suppliers,
  users,
} from '@/shared/infrastructure/db/schema';

type DB = ReturnType<typeof drizzle>;

/**
 * Row builders for the integration suite.
 *
 * They insert straight into the tables rather than going through use cases:
 * a repository test that arranges its fixtures through another repository
 * can't fail without ambiguity about which one broke.
 */

export async function makeCategory(db: DB, overrides: { name?: string; slug?: string } = {}) {
  const id = randomUUID();
  const name = overrides.name ?? `Category ${id.slice(0, 8)}`;
  await db.insert(categories).values({
    id,
    name,
    slug: overrides.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  });
  return { id, name };
}

export async function makeProduct(
  db: DB,
  overrides: Partial<{
    status: 'active' | 'draft' | 'archived';
    name: string;
    slug: string;
    sku: string;
    unitAmountMinor: number;
    currency: string;
    categoryId: string | null;
  }> = {},
) {
  const id = randomUUID();
  const short = id.slice(0, 8);
  const values = {
    id,
    slug: overrides.slug ?? `product-${short}`,
    name: overrides.name ?? `Product ${short}`,
    description: null,
    status: overrides.status ?? 'active',
    source: 'manual',
    categoryId: overrides.categoryId ?? null,
    sku: overrides.sku ?? `SKU-${short}`,
    unitAmountMinor: overrides.unitAmountMinor ?? 1999,
    currency: overrides.currency ?? 'USD',
  };
  await db.insert(products).values(values);
  return values;
}

export async function makeSupplier(
  db: DB,
  overrides: Partial<{ name: string; url: string; isActive: boolean }> = {},
) {
  const id = randomUUID();
  const values = {
    id,
    name: overrides.name ?? `Supplier ${id.slice(0, 8)}`,
    url: overrides.url ?? 'https://supplier.example/catalog',
    notes: null,
    isActive: overrides.isActive ?? true,
  };
  await db.insert(suppliers).values(values);
  return values;
}

export async function makeSupplierOffer(
  db: DB,
  args: {
    productId: string;
    supplierId: string;
    isPreferred?: boolean;
    isAvailable?: boolean;
    costAmountMinor?: number;
    createdAt?: Date;
  },
) {
  const id = randomUUID();
  const values = {
    id,
    productId: args.productId,
    supplierId: args.supplierId,
    supplierProductUrl: 'https://supplier.example/item',
    costAmountMinor: args.costAmountMinor ?? 900,
    costCurrency: 'USD',
    isAvailable: args.isAvailable ?? true,
    isPreferred: args.isPreferred ?? false,
    ...(args.createdAt ? { createdAt: args.createdAt } : {}),
  };
  await db.insert(supplierOffers).values(values);
  return values;
}

export async function makeUser(
  db: DB,
  overrides: Partial<{ email: string; role: 'customer' | 'admin' }> = {},
) {
  const id = randomUUID();
  const values = {
    id,
    email: overrides.email ?? `user-${id.slice(0, 8)}@example.com`,
    // Not a real hash: nothing in these tests authenticates, and a bcrypt
    // round per fixture would dominate the suite's runtime.
    passwordHash: 'not-a-real-hash',
    role: overrides.role ?? 'customer',
  };
  await db.insert(users).values(values);
  return values;
}
