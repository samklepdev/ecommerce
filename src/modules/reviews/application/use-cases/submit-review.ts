import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { Review } from '@/modules/reviews/domain/review';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface SubmitReviewInput {
  productId: string;
  userId: string;
  authorDisplayName: string;
  rating: number;
  title?: string | null;
  body: string;
}

export type SubmitReviewError = { code: 'product_not_found' } | { code: 'already_reviewed' };

/** One review per user per product. `isVerifiedPurchase` is computed here,
 * not trusted from the caller. Fires from an interactive storefront action,
 * so returns a `Result` rather than throwing. */
export class SubmitReview implements UseCase<SubmitReviewInput, Result<void, SubmitReviewError>> {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(input: SubmitReviewInput): Promise<Result<void, SubmitReviewError>> {
    const [product] = await this.products.findByIds([input.productId]);
    if (!product) return err({ code: 'product_not_found' });

    const existing = await this.reviews.findExistingByUserAndProduct(input.userId, input.productId);
    if (existing) return err({ code: 'already_reviewed' });

    const isVerifiedPurchase = await this.reviews.hasVerifiedPurchase(input.userId, input.productId);

    const review = Review.create({
      id: randomUUID(),
      productId: input.productId,
      userId: input.userId,
      authorDisplayName: input.authorDisplayName,
      rating: input.rating,
      title: input.title,
      body: input.body,
      isVerifiedPurchase,
    });
    await this.reviews.create(review);

    return ok(undefined);
  }
}
