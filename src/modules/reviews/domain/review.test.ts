import { describe, expect, it } from 'vitest';

import { Review } from './review';

function baseProps() {
  return {
    id: 'r1',
    productId: 'p1',
    userId: 'u1',
    authorDisplayName: 'Jamie',
    rating: 5,
    body: 'Great product, works as described.',
  };
}

describe('Review', () => {
  it('creates a review with sensible defaults', () => {
    const review = Review.create(baseProps());

    expect(review.status).toBe('pending');
    expect(review.isVerifiedPurchase).toBe(false);
    expect(review.title).toBeNull();
    expect(review.createdAt).toBeInstanceOf(Date);
  });

  it('respects explicit status and isVerifiedPurchase', () => {
    const review = Review.create({
      ...baseProps(),
      status: 'approved',
      isVerifiedPurchase: true,
      title: 'Solid buy',
    });

    expect(review.status).toBe('approved');
    expect(review.isVerifiedPurchase).toBe(true);
    expect(review.title).toBe('Solid buy');
  });

  it.each([0, 6, 2.5, -1])('rejects a non-integer or out-of-range rating (%s)', (rating) => {
    expect(() => Review.create({ ...baseProps(), rating })).toThrow(/rating/i);
  });

  it('rejects an empty body', () => {
    expect(() => Review.create({ ...baseProps(), body: '   ' })).toThrow(/body/i);
  });

  it('rejects an empty author display name', () => {
    expect(() => Review.create({ ...baseProps(), authorDisplayName: '  ' })).toThrow(/display name/i);
  });
});
