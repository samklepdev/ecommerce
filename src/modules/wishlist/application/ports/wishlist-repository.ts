export interface WishlistEntry {
  productId: string;
  savedAt: Date;
}

export interface WishlistRepository {
  /** Newest first — a wishlist reads as "what I've been eyeing lately". */
  listByUser(userId: string): Promise<WishlistEntry[]>;
  /** Idempotent: saving a product already saved is the same wish, not two.
   * Enforced by a unique index as well, so a double-click can't create a
   * duplicate row even if two requests race. */
  add(userId: string, productId: string): Promise<void>;
  remove(userId: string, productId: string): Promise<void>;
  /** Which of these the user has saved — one query for a page of cards,
   * rather than one per card. */
  savedProductIds(userId: string, productIds: string[]): Promise<Set<string>>;
}
