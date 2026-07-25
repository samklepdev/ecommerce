import type { UseCase } from '@/shared/application/use-case';
import type { ReviewRepository } from '@/modules/reviews/application/ports/review-repository';

export interface ApproveReviewInput {
  id: string;
}

export class ApproveReview implements UseCase<ApproveReviewInput, boolean> {
  constructor(private readonly reviews: ReviewRepository) {}

  async execute(input: ApproveReviewInput): Promise<boolean> {
    return this.reviews.setStatus(input.id, 'approved');
  }
}
