import type { Coupon } from '@/modules/coupons/domain/coupon';

export interface CouponRepository {
  list(): Promise<Coupon[]>;
  /** Normalizes (trim + uppercase) internally — every caller gets
   * case-insensitive matching for free. */
  findByCode(code: string): Promise<Coupon | null>;
  findById(id: string): Promise<Coupon | null>;
  create(coupon: Coupon): Promise<void>;
  /**
   * Consume one redemption, atomically, and report whether it applied.
   *
   * The limit cannot be enforced by reading the coupon and deciding: two
   * simultaneous checkouts both read "0 used, limit 1" and both proceed. This
   * is one conditional statement — increment *only if* the code is still
   * active, unexpired and under its limit — so exactly one of them wins.
   *
   * `false` means the code was exhausted, expired or deactivated between the
   * customer entering it and their order being written.
   */
  redeem(input: {
    code: string;
    now: Date;
    /** Who is redeeming — the customer's email, used for the per-customer
     * limit. Lower-cased by the implementation. */
    customerEmail: string;
  }): Promise<boolean>;
  setActive(id: string, isActive: boolean): Promise<void>;
  /** Hard delete. Safe because nothing references a coupon: an order
   * snapshots the code and discount it was given (`orders.coupon_code` is
   * plain text, not a foreign key), so removing one never rewrites history. */
  delete(id: string): Promise<void>;
}
