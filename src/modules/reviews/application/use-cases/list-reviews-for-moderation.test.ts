import { describe, expect, it } from 'vitest';

import { ListReviewsForModeration } from './list-reviews-for-moderation';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

describe('ListReviewsForModeration', () => {
  it('passes the status through to the repository', async () => {
    let received: string | undefined;
    const reviews: Partial<ReviewRepository> = {
      async listByStatus(status) {
        received = status;
        return [];
      },
    };

    await new ListReviewsForModeration(reviews as ReviewRepository).execute({ status: 'pending' });

    expect(received).toBe('pending');
  });

  it('passes undefined through for all statuses', async () => {
    let received: string | undefined = 'unset';
    const reviews: Partial<ReviewRepository> = {
      async listByStatus(status) {
        received = status;
        return [];
      },
    };

    await new ListReviewsForModeration(reviews as ReviewRepository).execute({});

    expect(received).toBeUndefined();
  });
});
