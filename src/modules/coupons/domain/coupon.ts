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
  readonly createdAt: Date;

  private constructor(props: CouponProps) {
    super(props.id);
    this.code = props.code.trim().toUpperCase();
    this.discountType = props.discountType;
    this.percentageValue = props.percentageValue ?? null;
    this.fixedAmountMinor = props.fixedAmountMinor ?? null;
    this.currency = props.currency ?? null;
    this.isActive = props.isActive ?? true;
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: CouponProps): Coupon {
    if (!props.code.trim()) throw new Error('Coupon requires a non-empty code');

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

  /** Clamped so the discount can never exceed the subtotal — a percentage
   * coupon already can't (≤100%), a fixed-amount one needs the explicit
   * clamp. Percentage math mirrors `ApplyMarkupToVariants`'s inline
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
