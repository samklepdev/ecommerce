import type { UseCase } from '@/shared/application/use-case';
import type { Review } from '@/modules/reviews/domain/review';
import type { RatingSummary, ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

export interface GetProductReviewsInput {
  productId: string;
  /** When provided, also resolves this user's own review for the product
   * (any status) — the write-review form needs to know "already reviewed,
   * pending moderation" even though that review isn't in the approved list
   * yet. */
  userId?: string;
}

export interface GetProductReviewsResult {
  reviews: Review[];
  summary: RatingSummary;
  myReview: Review | null;
}

export class GetProductReviews implements UseCase<GetProductReviewsInput, GetProductReviewsResult> {
  constructor(private readonly reviews: ReviewRepository) {}

  async execute(input: GetProductReviewsInput): Promise<GetProductReviewsResult> {
    const [reviews, summary, myReview] = await Promise.all([
      this.reviews.listApprovedForProduct(input.productId),
      this.reviews.getRatingSummaryForProduct(input.productId),
      input.userId ? this.reviews.findExistingByUserAndProduct(input.userId, input.productId) : null,
    ]);
    return { reviews, summary, myReview };
  }
}
