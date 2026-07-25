import type { UseCase } from '@/shared/application/use-case';
import type { Coupon } from '@/modules/coupons/domain/coupon';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

export class ListCoupons implements UseCase<void, Coupon[]> {
  constructor(private readonly coupons: CouponRepository) {}

  async execute(): Promise<Coupon[]> {
    return this.coupons.list();
  }
}
