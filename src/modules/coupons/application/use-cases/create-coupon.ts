import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { Coupon, type CouponDiscountType } from '@/modules/coupons/domain/coupon';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

export interface CreateCouponInput {
  code: string;
  discountType: CouponDiscountType;
  percentageValue?: number;
  fixedAmountMinor?: number;
  currency?: string;
}

export type CreateCouponError = { code: 'duplicate_code' };

export class CreateCoupon implements UseCase<CreateCouponInput, Result<Coupon, CreateCouponError>> {
  constructor(private readonly coupons: CouponRepository) {}

  async execute(input: CreateCouponInput): Promise<Result<Coupon, CreateCouponError>> {
    const existing = await this.coupons.findByCode(input.code);
    if (existing) return err({ code: 'duplicate_code' });

    const coupon = Coupon.create({ id: randomUUID(), ...input });
    await this.coupons.create(coupon);
    return ok(coupon);
  }
}
