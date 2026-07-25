import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { WriteReviewForm } from './WriteReviewForm';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import styles from './page.module.css';

function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export interface ReviewsSectionProps {
  productId: string;
  productSlug: string;
}

export async function ReviewsSection({ productId, productSlug }: ReviewsSectionProps) {
  const { getProductReviews } = getContainer();
  const user = await getSessionUser();

  const { reviews, summary, myReview } = await getProductReviews.execute({
    productId,
    userId: user?.id,
  });

  return (
    <div>
      <h2 className={styles.sectionTitle}>Reviews</h2>

      <div className={styles.reviewsSummary}>
        {summary.count > 0 ? (
          <>
            <span className={styles.reviewsStars} aria-hidden="true">
              {stars(Math.round(summary.average))}
            </span>
            <span>
              {summary.average.toFixed(1)} out of 5 ({summary.count} review{summary.count === 1 ? '' : 's'})
            </span>
          </>
        ) : (
          <span className={styles.meta}>No reviews yet.</span>
        )}
      </div>

      {user ? (
        myReview ? (
          <p className={styles.meta}>
            {myReview.status === 'pending'
              ? 'Your review is awaiting approval.'
              : myReview.status === 'rejected'
                ? 'Your review was not approved.'
                : 'You’ve already reviewed this product.'}
          </p>
        ) : (
          <WriteReviewForm productId={productId} productSlug={productSlug} />
        )
      ) : (
        <p className={styles.meta}>
          <Link href="/login">Log in</Link> to write a review.
        </p>
      )}

      {reviews.length > 0 && (
        <div className={styles.reviewsList}>
          {reviews.map((review) => (
            <Card key={review.id} className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <span className={styles.reviewsStars} aria-hidden="true">
                  {stars(review.rating)}
                </span>
                {review.isVerifiedPurchase && <Badge tone="accent">Verified purchase</Badge>}
              </div>
              {review.title && <p className={styles.reviewTitle}>{review.title}</p>}
              <p className={styles.reviewBody}>{review.body}</p>
              <p className={styles.meta}>
                {review.authorDisplayName} · {review.createdAt.toLocaleDateString()}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
