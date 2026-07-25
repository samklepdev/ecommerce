import { AggregateRoot } from '@/shared/domain/entity';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewProps {
  id: string;
  productId: string;
  /** Null once the reviewer's account has been deleted (FK is `set null`,
   * same as `Order.userId`) — the review itself, and its `authorDisplayName`
   * snapshot, survive. */
  userId: string | null;
  authorDisplayName: string;
  rating: number;
  title?: string | null;
  body: string;
  status?: ReviewStatus;
  isVerifiedPurchase?: boolean;
  createdAt?: Date;
}

/** A pending review is invisible on the storefront until an admin approves
 * it — mirrors `Product.status` as the closest existing moderation-field
 * template in this codebase. */
export class Review extends AggregateRoot<string> {
  readonly productId: string;
  readonly userId: string | null;
  readonly authorDisplayName: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string;
  readonly status: ReviewStatus;
  readonly isVerifiedPurchase: boolean;
  readonly createdAt: Date;

  private constructor(props: ReviewProps) {
    super(props.id);
    this.productId = props.productId;
    this.userId = props.userId;
    this.authorDisplayName = props.authorDisplayName;
    this.rating = props.rating;
    this.title = props.title ?? null;
    this.body = props.body;
    this.status = props.status ?? 'pending';
    this.isVerifiedPurchase = props.isVerifiedPurchase ?? false;
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: ReviewProps): Review {
    if (!Number.isInteger(props.rating) || props.rating < 1 || props.rating > 5) {
      throw new Error('Review requires an integer rating between 1 and 5');
    }
    if (!props.body.trim()) throw new Error('Review requires a non-empty body');
    if (!props.authorDisplayName.trim()) throw new Error('Review requires a non-empty display name');
    return new Review(props);
  }
}
