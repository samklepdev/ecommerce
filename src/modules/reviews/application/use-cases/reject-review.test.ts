import { describe, expect, it } from 'vitest';

import { RejectReview } from './reject-review';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

describe('RejectReview', () => {
  it('rejects the review and returns true', async () => {
    const calls: { id: string; status: string }[] = [];
    const reviews: Partial<ReviewRepository> = {
      async setStatus(id, status) {
        calls.push({ id, status });
        return true;
      },
    };

    const result = await new RejectReview(reviews as ReviewRepository).execute({ id: 'r1' });

    expect(result).toBe(true);
    expect(calls).toEqual([{ id: 'r1', status: 'rejected' }]);
  });

  it('returns false when the review does not exist', async () => {
    const reviews: Partial<ReviewRepository> = {
      async setStatus() {
        return false;
      },
    };

    const result = await new RejectReview(reviews as ReviewRepository).execute({ id: 'missing' });

    expect(result).toBe(false);
  });
});
