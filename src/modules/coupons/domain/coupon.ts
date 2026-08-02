import { AggregateRoot } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';

export type CouponDiscountType = 'percentage' | 'fixed_amount';

export interface CouponProps {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  /** 1-100 integer — required iff `discountType` is `percentage`, must be
   * absent for `fixed_amount`. */
  percentageValue?: number;
  /** Positive integer minor units — required iff `discountType` is
   * `fixed_amount`, must be absent for `percentage`. */
  fixedAmountMinor?: number;
  /** Required iff `discountType` is `fixed_amount` (this store is USD-only
   * in practice, so the admin form hardcodes it — still validated here so
   * the domain stays correct on its own terms). */
  currency?: string;
  isActive?: boolean;
  /**
   * When the code stops working. Null means it never expires.
   *
   * A campaign code with no end date outlives the campaign: it gets posted to
   * a deals site and keeps discounting orders months later, and the only way
   * to notice is for someone to read the coupon list.
   */
  expiresAt?: Date | null;
  /**
   * How many orders may ever use this code. Null means unlimited.
   *
   * Enforced atomically at redemption time, not by this class — two
   * simultaneous checkouts both reading "0 used, limit 1" would both pass any
   * check made here. See `CouponRepository.redeem`.
   */
  maxRedemptions?: number | null;
  /** How many orders have used it so far. */
  redemptionCount?: number;
  /**
   * How many times one customer may use it. Null means unlimited.
   *
   * Like `maxRedemptions`, enforced at redemption time rather than here —
   * counting past uses and then deciding lets two simultaneous checkouts by
   * the same person both pass.
   */
  maxPerCustomer?: number | null;
  createdAt?: Date;
}

/** An admin-managed discount code, applied server-side at `PlaceOrder`
 * time (never trusted from the client) — see `discountAmountFor`. */
export class Coupon extends AggregateRoot<string> {
  readonly code: string;
  readonly discountType: CouponDiscountType;
  readonly percentageValue: number | null;
  readonly fixedAmountMinor: number | null;
  readonly currency: string | null;
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly maxPerCustomer: number | null;
  readonly redemptionCount: number;
  readonly createdAt: Date;

  private constructor(props: CouponProps) {
    super(props.id);
    this.code = props.code.trim().toUpperCase();
    this.discountType = props.discountType;
    this.percentageValue = props.percentageValue ?? null;
    this.fixedAmountMinor = props.fixedAmountMinor ?? null;
    this.currency = props.currency ?? null;
    this.isActive = props.isActive ?? true;
    this.expiresAt = props.expiresAt ?? null;
    this.maxRedemptions = props.maxRedemptions ?? null;
    this.maxPerCustomer = props.maxPerCustomer ?? null;
    this.redemptionCount = props.redemptionCount ?? 0;
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: CouponProps): Coupon {
    if (!props.code.trim()) throw new Error('Coupon requires a non-empty code');

    if (
      props.maxRedemptions !== undefined &&
      props.maxRedemptions !== null &&
      (!Number.isInteger(props.maxRedemptions) || props.maxRedemptions < 1)
    ) {
      // 0 would be a code that can never be used, which is what `isActive:
      // false` already says, more legibly.
      throw new Error('Coupon redemption limit must be a positive integer, or unset');
    }

    if (
      props.maxPerCustomer !== undefined &&
      props.maxPerCustomer !== null &&
      (!Number.isInteger(props.maxPerCustomer) || props.maxPerCustomer < 1)
    ) {
      throw new Error('Coupon per-customer limit must be a positive integer, or unset');
    }

    if (props.discountType === 'percentage') {
      if (
        props.percentageValue === undefined ||
        !Number.isInteger(props.percentageValue) ||
        props.percentageValue < 1 ||
        props.percentageValue > 100
      ) {
        throw new Error('Coupon percentage must be an integer between 1 and 100');
      }
      if (props.fixedAmountMinor !== undefined) {
        throw new Error('A percentage coupon cannot also have a fixed amount');
      }
    } else {
      if (props.percentageValue !== undefined) {
        throw new Error('A fixed_amount coupon cannot also have a percentage');
      }
      if (!props.currency || props.currency.length !== 3) {
        throw new Error('Coupon requires a 3-letter currency for a fixed amount');
      }
      if (
        props.fixedAmountMinor === undefined ||
        !Number.isInteger(props.fixedAmountMinor) ||
        props.fixedAmountMinor <= 0
      ) {
        throw new Error('Coupon fixed amount must be a positive integer minor-unit value');
      }
    }

    return new Coupon(props);
  }

  /**
   * Whether this code is usable right now, ignoring the redemption race.
   *
   * Deliberately **not** the authority on the redemption limit: two
   * simultaneous checkouts would both read the same count and both pass. This
   * is the check that produces a good error message while the customer still
   * has their cart; `CouponRepository.redeem` is what actually enforces the
   * limit, in one conditional statement.
   */
  isRedeemableAt(now: Date): boolean {
    if (!this.isActive) return false;
    if (this.expiresAt !== null && this.expiresAt.getTime() <= now.getTime()) return false;
    if (this.maxRedemptions !== null && this.redemptionCount >= this.maxRedemptions) return false;
    return true;
  }

  /** Clamped so the discount can never exceed the subtotal — a percentage
   * coupon already can't (≤100%), a fixed-amount one needs the explicit
   * clamp. Percentage math mirrors `ApplyMarkupToProducts`'s inline
   * `Math.round(amountMinor * pct / 100)` convention. */
  discountAmountFor(subtotal: Money): Money {
    if (this.discountType === 'percentage') {
      const amountMinor = Math.round((subtotal.amountMinor * this.percentageValue!) / 100);
      return Money.of(amountMinor, subtotal.currency);
    }
    const amountMinor = Math.min(this.fixedAmountMinor!, subtotal.amountMinor);
    return Money.of(amountMinor, subtotal.currency);
  }
}

/**
 * How a coupon's limits read to an admin.
 *
 * In the domain rather than the page, because "unlimited" is a claim about
 * what the code will do and both surfaces that make it — the settings list and
 * anything added later — must say the same thing. A code with no limits is
 * exactly the one that outlives its campaign, so saying so plainly is the
 * point.
 */
export function couponLimitsDisplay(coupon: {
  expiresAt: Date | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  redemptionCount: number;
}): string {
  const parts: string[] = [];
  if (coupon.expiresAt) {
    // UTC, matching how the deadline is stored and compared — a local
    // rendering would show a date the server does not agree with.
    parts.push(`expires ${coupon.expiresAt.toISOString().slice(0, 10)}`);
  }
  if (coupon.maxRedemptions !== null) {
    parts.push(`${coupon.redemptionCount}/${coupon.maxRedemptions} used`);
  } else if (coupon.redemptionCount > 0) {
    parts.push(`${coupon.redemptionCount} used`);
  }
  if (coupon.maxPerCustomer !== null) {
    parts.push(`max ${coupon.maxPerCustomer} per customer`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No limits';
}
