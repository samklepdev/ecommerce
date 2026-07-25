import { describe, expect, it } from 'vitest';

import { SubmitReview } from './submit-review';
import { Review } from '@/modules/reviews/domain/review';
import { isErr, isOk } from '@/shared/domain/result';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { Product } from '@/modules/catalog/domain/product';

function makeDeps(options: {
  productExists?: boolean;
  existingReview?: Review | null;
  verifiedPurchase?: boolean;
}) {
  const { productExists = true, existingReview = null, verifiedPurchase = false } = options;
  const created: Review[] = [];

  const reviews: Partial<ReviewRepository> = {
    async findExistingByUserAndProduct() {
      return existingReview;
    },
    async hasVerifiedPurchase() {
      return verifiedPurchase;
    },
    async create(review) {
      created.push(review);
    },
  };

  const products: Partial<ProductRepository> = {
    async findByIds() {
      return productExists ? ([{ id: 'p1' }] as Product[]) : [];
    },
  };

  return {
    reviews: reviews as ReviewRepository,
    products: products as ProductRepository,
    created,
  };
}

describe('SubmitReview', () => {
  it('creates a pending review and reports whether the purchase is verified', async () => {
    const { reviews, products, created } = makeDeps({ verifiedPurchase: true });

    const result = await new SubmitReview(reviews, products).execute({
      productId: 'p1',
      userId: 'u1',
      authorDisplayName: 'Jamie',
      rating: 4,
      title: 'Pretty good',
      body: 'Did what it said.',
    });

    expect(isOk(result)).toBe(true);
    expect(created).toHaveLength(1);
    const [review] = created;
    expect(review?.status).toBe('pending');
    expect(review?.isVerifiedPurchase).toBe(true);
  });

  it('rejects a review for a product that does not exist', async () => {
    const { reviews, products } = makeDeps({ productExists: false });

    const result = await new SubmitReview(reviews, products).execute({
      productId: 'missing',
      userId: 'u1',
      authorDisplayName: 'Jamie',
      rating: 4,
      body: 'Body text.',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('product_not_found');
  });

  it('rejects a second review from the same user for the same product', async () => {
    const existing = Review.create({
      id: 'r0',
      productId: 'p1',
      userId: 'u1',
      authorDisplayName: 'Jamie',
      rating: 5,
      body: 'First review.',
    });
    const { reviews, products } = makeDeps({ existingReview: existing });

    const result = await new SubmitReview(reviews, products).execute({
      productId: 'p1',
      userId: 'u1',
      authorDisplayName: 'Jamie',
      rating: 3,
      body: 'Second review attempt.',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('already_reviewed');
  });
});
