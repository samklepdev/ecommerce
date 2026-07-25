import type { UseCase } from '@/shared/application/use-case';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

export interface SetCouponActiveInput {
  id: string;
  isActive: boolean;
}

export class SetCouponActive implements UseCase<SetCouponActiveInput, void> {
  constructor(private readonly coupons: CouponRepository) {}

  async execute(input: SetCouponActiveInput): Promise<void> {
    await this.coupons.setActive(input.id, input.isActive);
  }
}
