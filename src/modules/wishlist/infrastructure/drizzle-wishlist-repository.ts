import { and, eq, inArray } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { wishlistItems } from '@/shared/infrastructure/db/schema';
import type {
  WishlistEntry,
  WishlistRepository,
} from '@/modules/wishlist/application/ports/wishlist-repository';
import { newWishlistItemId } from '@/modules/wishlist/application/use-cases/manage-wishlist';

export class DrizzleWishlistRepository implements WishlistRepository {
  constructor(private readonly db: DB) {}

  async listByUser(userId: string): Promise<WishlistEntry[]> {
    const rows = await this.db.query.wishlistItems.findMany({
      where: eq(wishlistItems.userId, userId),
      orderBy: (w, { desc }) => [desc(w.createdAt)],
    });
    return rows.map((row) => ({ productId: row.productId, savedAt: row.createdAt }));
  }

  async add(userId: string, productId: string): Promise<void> {
    // onConflictDoNothing rather than a read-then-write: two rapid clicks
    // race, and the unique index is the thing that actually decides.
    await this.db
      .insert(wishlistItems)
      .values({ id: newWishlistItemId(), userId, productId })
      .onConflictDoNothing();
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
  }

  async savedProductIds(userId: string, productIds: string[]): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    const rows = await this.db
      .select({ productId: wishlistItems.productId })
      .from(wishlistItems)
      .where(
        and(eq(wishlistItems.userId, userId), inArray(wishlistItems.productId, productIds)),
      );
    return new Set(rows.map((r) => r.productId));
  }
}
