import { describe, expect, it } from 'vitest';

import { DeleteCoupon } from './delete-coupon';
import { Coupon } from '@/modules/coupons/domain/coupon';
import { isErr, isOk } from '@/shared/domain/result';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

function makeRepo(existing: Coupon | null) {
  const deleted: string[] = [];
  const repo: Partial<CouponRepository> = {
    async findById() {
      return existing;
    },
    async delete(id) {
      deleted.push(id);
    },
  };
  return { repo: repo as CouponRepository, deleted };
}

const aCoupon = (isActive = true) =>
  Coupon.create({
    id: 'c1',
    code: 'SAVE10',
    discountType: 'percentage',
    percentageValue: 10,
    isActive,
  });

describe('DeleteCoupon', () => {
  it('deletes an existing coupon', async () => {
    const { repo, deleted } = makeRepo(aCoupon());

    const result = await new DeleteCoupon(repo).execute({ id: 'c1' });

    expect(isOk(result)).toBe(true);
    expect(deleted).toEqual(['c1']);
  });

  it('deletes an active coupon too', async () => {
    // Deliberately allowed. Unlike a supplier, nothing references a coupon:
    // an order snapshots the code and the discount it was given, so deleting
    // one cannot alter an order that already used it. Requiring deactivation
    // first would be ceremony protecting nothing.
    const { repo, deleted } = makeRepo(aCoupon(true));

    const result = await new DeleteCoupon(repo).execute({ id: 'c1' });

    expect(isOk(result)).toBe(true);
    expect(deleted).toEqual(['c1']);
  });

  it('reports a coupon that no longer exists rather than silently succeeding', async () => {
    // Two admins on the same page: the second press must say so, not report
    // a delete it didn't do.
    const { repo, deleted } = makeRepo(null);

    const result = await new DeleteCoupon(repo).execute({ id: 'gone' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('not_found');
    expect(deleted).toEqual([]);
  });
});
