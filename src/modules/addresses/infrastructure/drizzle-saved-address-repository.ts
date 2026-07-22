import { and, eq, ne } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { savedAddresses } from '@/shared/infrastructure/db/schema';
import { SavedAddress } from '@/modules/addresses/domain/saved-address';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

type Row = typeof savedAddresses.$inferSelect;

function toSavedAddress(row: Row): SavedAddress {
  return SavedAddress.create({
    id: row.id,
    userId: row.userId,
    name: row.name,
    line1: row.line1,
    line2: row.line2 ?? undefined,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
  });
}

export class DrizzleSavedAddressRepository implements SavedAddressRepository {
  constructor(private readonly db: DB) {}

  async listForUser(userId: string): Promise<SavedAddress[]> {
    const rows = await this.db.query.savedAddresses.findMany({
      where: eq(savedAddresses.userId, userId),
      orderBy: (a, { desc }) => [desc(a.isDefault), desc(a.createdAt)],
    });
    return rows.map(toSavedAddress);
  }

  async create(address: SavedAddress): Promise<void> {
    await this.db.insert(savedAddresses).values({
      id: address.id,
      userId: address.userId,
      name: address.name,
      line1: address.line1,
      line2: address.line2 ?? null,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
    });
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(savedAddresses)
      .where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, userId)))
      .returning({ id: savedAddresses.id });
    return result.length > 0;
  }

  async setDefault(id: string, userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(savedAddresses)
        .set({ isDefault: true })
        .where(and(eq(savedAddresses.id, id), eq(savedAddresses.userId, userId)))
        .returning({ id: savedAddresses.id });
      if (!row) return false;

      // Unset every other address for this user — the just-set row is
      // excluded via `ne` so this doesn't race with the update above.
      await tx
        .update(savedAddresses)
        .set({ isDefault: false })
        .where(and(eq(savedAddresses.userId, userId), ne(savedAddresses.id, id)));
      return true;
    });
  }
}
