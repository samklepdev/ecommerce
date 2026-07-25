import type { UseCase } from '@/shared/application/use-case';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

export interface RejectReviewInput {
  id: string;
}

export class RejectReview implements UseCase<RejectReviewInput, boolean> {
  constructor(private readonly reviews: ReviewRepository) {}

  async execute(input: RejectReviewInput): Promise<boolean> {
    return this.reviews.setStatus(input.id, 'rejected');
  }
}
