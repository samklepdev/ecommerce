import type { Coupon } from '@/modules/coupons/domain/coupon';

export interface CouponRepository {
  list(): Promise<Coupon[]>;
  /** Normalizes (trim + uppercase) internally — every caller gets
   * case-insensitive matching for free. */
  findByCode(code: string): Promise<Coupon | null>;
  findById(id: string): Promise<Coupon | null>;
  create(coupon: Coupon): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
  /** Hard delete. Safe because nothing references a coupon: an order
   * snapshots the code and discount it was given (`orders.coupon_code` is
   * plain text, not a foreign key), so removing one never rewrites history. */
  delete(id: string): Promise<void>;
}
