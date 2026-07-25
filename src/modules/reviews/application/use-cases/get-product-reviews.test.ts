import { describe, expect, it } from 'vitest';

import { GetProductReviews } from './get-product-reviews';
import { Review } from '@/modules/reviews/domain/review';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

describe('GetProductReviews', () => {
  it('returns the approved reviews and the rating summary for a product', async () => {
    const review = Review.create({
      id: 'r1',
      productId: 'p1',
      userId: 'u1',
      authorDisplayName: 'Jamie',
      rating: 5,
      body: 'Great!',
      status: 'approved',
    });
    const reviews: Partial<ReviewRepository> = {
      async listApprovedForProduct(productId) {
        expect(productId).toBe('p1');
        return [review];
      },
      async getRatingSummaryForProduct(productId) {
        expect(productId).toBe('p1');
        return { average: 5, count: 1 };
      },
    };

    const result = await new GetProductReviews(reviews as ReviewRepository).execute({ productId: 'p1' });

    expect(result).toEqual({ reviews: [review], summary: { average: 5, count: 1 }, myReview: null });
  });

  it('resolves the caller\'s own review (any status) when a userId is given', async () => {
    const mine = Review.create({
      id: 'r2',
      productId: 'p1',
      userId: 'u2',
      authorDisplayName: 'Alex',
      rating: 3,
      body: 'Still pending.',
    });
    const reviews: Partial<ReviewRepository> = {
      async listApprovedForProduct() {
        return [];
      },
      async getRatingSummaryForProduct() {
        return { average: 0, count: 0 };
      },
      async findExistingByUserAndProduct(userId, productId) {
        expect(userId).toBe('u2');
        expect(productId).toBe('p1');
        return mine;
      },
    };

    const result = await new GetProductReviews(reviews as ReviewRepository).execute({
      productId: 'p1',
      userId: 'u2',
    });

    expect(result.myReview).toBe(mine);
  });
});
