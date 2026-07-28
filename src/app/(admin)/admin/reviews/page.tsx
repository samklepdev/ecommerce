import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { approveReviewAction, rejectReviewAction } from '@/app/actions/admin/reviews';
import type { ReviewStatus } from '@/modules/reviews/domain/review';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ReviewStatusFilterSelect } from './ReviewStatusFilterSelect';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminReviewsPageProps {
  searchParams: Promise<{ status?: string }>;
}

const VALID_STATUSES = new Set<ReviewStatus>(['pending', 'approved', 'rejected']);

function parseStatus(raw: string | undefined): ReviewStatus | undefined {
  return raw && VALID_STATUSES.has(raw as ReviewStatus) ? (raw as ReviewStatus) : undefined;
}

function statusTone(status: ReviewStatus): 'neutral' | 'success' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'neutral';
}

export default async function AdminReviewsPage({ searchParams }: AdminReviewsPageProps) {
  await requireAdmin();
  const { status: statusParam } = await searchParams;
  // No query param at all defaults to the moderation queue (pending);
  // an explicit "all" (or any non-matching value) shows every status.
  const status = statusParam === undefined ? 'pending' : parseStatus(statusParam);

  const { listReviewsForModeration, getAnyProductsByIds } = getContainer();
  const reviews = await listReviewsForModeration.execute({ status });
  // Only the products these reviews are about, rather than the whole
  // catalog to build a lookup map.
  const products = await getAnyProductsByIds.execute({
    productIds: [...new Set(reviews.map((r) => r.productId))],
  });
  const productById = new Map(products.map((p) => [p.id, p] as const));

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.toolbar}>
          <h1>Reviews</h1>
          <ReviewStatusFilterSelect selectedStatus={statusParam} />
        </div>

        {reviews.length === 0 && <p className={styles.empty}>Nothing here.</p>}

        <Stack gap={3}>
          {reviews.map((review) => {
            const product = productById.get(review.productId);
            return (
              <Card key={review.id}>
                <div className={styles.cardHeader}>
                  <div>
                    {product ? (
                      <Link href={`/products/${product.slug.value}`}>{product.name}</Link>
                    ) : (
                      <span className={styles.meta}>Unknown product ({review.productId})</span>
                    )}
                    <p className={styles.meta}>
                      {review.rating}/5 · {review.authorDisplayName} · {review.createdAt.toLocaleDateString()}
                      {review.isVerifiedPurchase && ' · Verified purchase'}
                    </p>
                  </div>
                  <Badge tone={statusTone(review.status)}>{review.status}</Badge>
                </div>

                {review.title && <p className={styles.reviewTitle}>{review.title}</p>}
                <p className={styles.reviewBody}>{review.body}</p>

                {review.status === 'pending' && (
                  <div className={styles.actionRow}>
                    <form action={approveReviewAction}>
                      <input type="hidden" name="id" value={review.id} />
                      <Button type="submit" variant="secondary">
                        Approve
                      </Button>
                    </form>
                    <form action={rejectReviewAction}>
                      <input type="hidden" name="id" value={review.id} />
                      <Button type="submit" variant="danger">
                        Reject
                      </Button>
                    </form>
                  </div>
                )}
              </Card>
            );
          })}
        </Stack>
      </Stack>
    </PageContainer>
  );
}
