import type { Coupon } from '@/modules/coupons/domain/coupon';

export interface CouponRepository {
  list(): Promise<Coupon[]>;
  /** Normalizes (trim + uppercase) internally — every caller gets
   * case-insensitive matching for free. */
  findByCode(code: string): Promise<Coupon | null>;
  create(coupon: Coupon): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
}
