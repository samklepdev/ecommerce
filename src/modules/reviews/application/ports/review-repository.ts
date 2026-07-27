import type { Review, ReviewStatus } from '@/modules/reviews/domain/review';

export interface RatingSummary {
  average: number;
  count: number;
}

export interface ReviewRepository {
  create(review: Review): Promise<void>;
  findExistingByUserAndProduct(userId: string, productId: string): Promise<Review | null>;
  listApprovedForProduct(productId: string): Promise<Review[]>;
  /** SQL-level avg/count, not a client-side reduction — this is queried on
   * every product detail page view. `count: 0` implies `average: 0`. */
  getRatingSummaryForProduct(productId: string): Promise<RatingSummary>;
  /** `undefined` returns all three statuses. */
  listByStatus(status?: ReviewStatus): Promise<Review[]>;
  /** Guarded + idempotent: false if the review doesn't exist. */
  setStatus(id: string, status: 'approved' | 'rejected'): Promise<boolean>;
  /** True if this user has a `paid` order containing this
   * product. */
  hasVerifiedPurchase(userId: string, productId: string): Promise<boolean>;
}
