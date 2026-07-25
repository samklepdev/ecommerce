import { describe, expect, it } from 'vitest';

import { CreateCoupon } from './create-coupon';
import { Coupon } from '@/modules/coupons/domain/coupon';
import { isErr, isOk } from '@/shared/domain/result';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

function makeRepo(existing: Coupon | null = null) {
  const created: Coupon[] = [];
  const repo: Partial<CouponRepository> = {
    async findByCode() {
      return existing;
    },
    async create(coupon) {
      created.push(coupon);
    },
  };
  return { repo: repo as CouponRepository, created };
}

describe('CreateCoupon', () => {
  it('creates a percentage coupon', async () => {
    const { repo, created } = makeRepo();

    const result = await new CreateCoupon(repo).execute({
      code: 'SAVE10',
      discountType: 'percentage',
      percentageValue: 10,
    });

    expect(isOk(result)).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]?.code).toBe('SAVE10');
  });

  it('rejects a duplicate code (case-insensitive)', async () => {
    const existing = Coupon.create({
      id: 'c0',
      code: 'save10',
      discountType: 'percentage',
      percentageValue: 5,
    });
    const { repo, created } = makeRepo(existing);

    const result = await new CreateCoupon(repo).execute({
      code: 'SAVE10',
      discountType: 'percentage',
      percentageValue: 10,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('duplicate_code');
    expect(created).toHaveLength(0);
  });
});
