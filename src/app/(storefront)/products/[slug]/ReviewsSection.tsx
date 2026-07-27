import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import type { Review } from '@/modules/reviews/domain/review';
import { WriteReviewForm } from './WriteReviewForm';
import { Rating } from './Rating';
import styles from './ReviewsSection.module.css';

export interface ReviewsSectionProps {
  productId: string;
  productSlug: string;
}

const STARS = [5, 4, 3, 2, 1] as const;

/** How many of the shown reviews sit at each star.
 *
 * Computed from the approved reviews on the page rather than from
 * `summary`, which carries only an average and a count — so the bars always
 * add up to the list beneath them. */
function distribution(reviews: Review[]): { stars: number; count: number }[] {
  return STARS.map((stars) => ({
    stars,
    count: reviews.filter((r) => Math.round(r.rating) === stars).length,
  }));
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export async function ReviewsSection({ productId, productSlug }: ReviewsSectionProps) {
  const { getProductReviews } = getContainer();
  const user = await getSessionUser();

  const { reviews, summary, myReview } = await getProductReviews.execute({
    productId,
    userId: user?.id,
  });

  const dist = distribution(reviews);
  const shown = reviews.length;

  return (
    <section className={styles.reviews} id="reviews">
      <div className={styles.header}>
        <h2>Reviews</h2>
      </div>

      {summary.count === 0 ? (
        <p className={styles.empty}>
          No reviews yet. {user ? 'Be the first to write one.' : 'Log in to be the first.'}
        </p>
      ) : (
        <div className={styles.grid}>
          <aside className={styles.summary}>
            <span className={styles.big}>{summary.average.toFixed(1)}</span>
            <Rating value={summary.average} size={16} />
            <span className={styles.count}>
              {summary.count} review{summary.count === 1 ? '' : 's'}
            </span>

            {shown > 0 && (
              <div className={styles.dist}>
                {dist.map((row) => (
                  <div className={styles.distRow} key={row.stars}>
                    <span className={styles.distStar}>{row.stars}★</span>
                    <span className={styles.distTrack}>
                      <span style={{ width: `${(row.count / shown) * 100}%` }} />
                    </span>
                    <span className={styles.distCount}>{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <div className={styles.list}>
            {reviews.map((review) => (
              <article className={styles.review} key={review.id}>
                <div className={styles.reviewHead}>
                  <span className={styles.avatar} aria-hidden="true">
                    {review.authorDisplayName.charAt(0).toUpperCase()}
                  </span>
                  <div className={styles.who}>
                    <span className={styles.author}>
                      {review.authorDisplayName}
                      {review.isVerifiedPurchase && (
                        <span className={styles.verified}>Verified purchase</span>
                      )}
                    </span>
                    <span className={styles.meta}>
                      <Rating value={review.rating} size={11} />
                      <span className={styles.date}>{dateFormat.format(review.createdAt)}</span>
                    </span>
                  </div>
                </div>
                {review.title && <h3 className={styles.reviewTitle}>{review.title}</h3>}
                <p className={styles.body}>{review.body}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className={styles.write}>
        {user ? (
          myReview ? (
            <p className={styles.note}>
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
          <p className={styles.note}>
            <Link href="/login">Log in</Link> to write a review.
          </p>
        )}
      </div>
    </section>
  );
}
