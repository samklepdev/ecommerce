import type { UseCase } from '@/shared/application/use-case';
import type { Review, ReviewStatus } from '@/modules/reviews/domain/review';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

export interface ListReviewsForModerationInput {
  status?: ReviewStatus;
}

export class ListReviewsForModeration implements UseCase<ListReviewsForModerationInput, Review[]> {
  constructor(private readonly reviews: ReviewRepository) {}

  async execute(input: ListReviewsForModerationInput): Promise<Review[]> {
    return this.reviews.listByStatus(input.status);
  }
}
