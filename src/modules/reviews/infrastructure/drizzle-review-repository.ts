import { and, eq, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { reviews, orders, orderLines } from '@/shared/infrastructure/db/schema';
import { Review, type ReviewStatus } from '@/modules/reviews/domain/review';
import type { RatingSummary, ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

type Row = typeof reviews.$inferSelect;

function toReview(row: Row): Review {
  return Review.create({
    id: row.id,
    productId: row.productId,
    userId: row.userId,
    authorDisplayName: row.authorDisplayName,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status as ReviewStatus,
    isVerifiedPurchase: row.isVerifiedPurchase,
    createdAt: row.createdAt,
  });
}

export class DrizzleReviewRepository implements ReviewRepository {
  constructor(private readonly db: DB) {}

  async create(review: Review): Promise<void> {
    await this.db.insert(reviews).values({
      id: review.id,
      productId: review.productId,
      userId: review.userId,
      authorDisplayName: review.authorDisplayName,
      rating: review.rating,
      title: review.title,
      body: review.body,
      status: review.status,
      isVerifiedPurchase: review.isVerifiedPurchase,
    });
  }

  async findExistingByUserAndProduct(userId: string, productId: string): Promise<Review | null> {
    const row = await this.db.query.reviews.findFirst({
      where: and(eq(reviews.userId, userId), eq(reviews.productId, productId)),
    });
    return row ? toReview(row) : null;
  }

  async listApprovedForProduct(productId: string): Promise<Review[]> {
    const rows = await this.db.query.reviews.findMany({
      where: and(eq(reviews.productId, productId), eq(reviews.status, 'approved')),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return rows.map(toReview);
  }

  async getRatingSummaryForProduct(productId: string): Promise<RatingSummary> {
    const [row] = await this.db
      .select({
        average: sql<string>`coalesce(avg(${reviews.rating}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(reviews)
      .where(and(eq(reviews.productId, productId), eq(reviews.status, 'approved')));
    return { average: Number(row?.average ?? 0), count: Number(row?.count ?? 0) };
  }

  async listByStatus(status?: ReviewStatus): Promise<Review[]> {
    const rows = await this.db.query.reviews.findMany({
      where: status ? eq(reviews.status, status) : undefined,
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return rows.map(toReview);
  }

  async setStatus(id: string, status: 'approved' | 'rejected'): Promise<boolean> {
    const result = await this.db
      .update(reviews)
      .set({ status })
      .where(eq(reviews.id, id))
      .returning({ id: reviews.id });
    return result.length > 0;
  }

  async hasVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: orderLines.id })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.paymentStatus, 'paid'),
          eq(orderLines.productId, productId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
