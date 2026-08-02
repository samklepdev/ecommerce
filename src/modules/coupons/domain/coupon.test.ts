import { describe, expect, it } from 'vitest';

import { Coupon } from './coupon';
import { Money } from '@/shared/domain/money';

describe('Coupon.create', () => {
  it('normalizes the code to trimmed uppercase', () => {
    const coupon = Coupon.create({
      id: 'c1',
      code: '  save10  ',
      discountType: 'percentage',
      percentageValue: 10,
    });
    expect(coupon.code).toBe('SAVE10');
  });

  it('defaults isActive to true', () => {
    const coupon = Coupon.create({
      id: 'c1',
      code: 'SAVE10',
      discountType: 'percentage',
      percentageValue: 10,
    });
    expect(coupon.isActive).toBe(true);
  });

  it('rejects an empty code', () => {
    expect(() =>
      Coupon.create({ id: 'c1', code: '   ', discountType: 'percentage', percentageValue: 10 }),
    ).toThrow(/code/i);
  });

  it.each([0, 101, 1.5, -5])('rejects a non-integer or out-of-range percentage (%s)', (percentageValue) => {
    expect(() =>
      Coupon.create({ id: 'c1', code: 'SAVE10', discountType: 'percentage', percentageValue }),
    ).toThrow(/percentage/i);
  });

  it('rejects a percentage coupon with a fixedAmountMinor set', () => {
    expect(() =>
      Coupon.create({
        id: 'c1',
        code: 'SAVE10',
        discountType: 'percentage',
        percentageValue: 10,
        fixedAmountMinor: 500,
      }),
    ).toThrow();
  });

  it('rejects a fixed_amount coupon missing fixedAmountMinor or currency', () => {
    expect(() =>
      Coupon.create({ id: 'c1', code: 'FIVEOFF', discountType: 'fixed_amount', fixedAmountMinor: 500 }),
    ).toThrow(/currency/i);
    expect(() =>
      Coupon.create({ id: 'c1', code: 'FIVEOFF', discountType: 'fixed_amount', currency: 'USD' }),
    ).toThrow(/amount/i);
  });

  it('rejects a non-positive fixedAmountMinor', () => {
    expect(() =>
      Coupon.create({
        id: 'c1',
        code: 'FIVEOFF',
        discountType: 'fixed_amount',
        fixedAmountMinor: 0,
        currency: 'USD',
      }),
    ).toThrow(/amount/i);
  });

  it('rejects a fixed_amount coupon with a percentageValue set', () => {
    expect(() =>
      Coupon.create({
        id: 'c1',
        code: 'FIVEOFF',
        discountType: 'fixed_amount',
        fixedAmountMinor: 500,
        currency: 'USD',
        percentageValue: 10,
      }),
    ).toThrow();
  });
});

describe('Coupon#discountAmountFor', () => {
  it('computes a percentage discount, rounded', () => {
    const coupon = Coupon.create({ id: 'c1', code: 'SAVE10', discountType: 'percentage', percentageValue: 10 });
    // 10% of 1999 = 199.9 -> rounds to 200
    expect(coupon.discountAmountFor(Money.of(1999, 'USD')).amountMinor).toBe(200);
  });

  it('never exceeds the subtotal for a percentage coupon', () => {
    const coupon = Coupon.create({ id: 'c1', code: 'FULL', discountType: 'percentage', percentageValue: 100 });
    expect(coupon.discountAmountFor(Money.of(1500, 'USD')).amountMinor).toBe(1500);
  });

  it('returns the fixed amount when it is less than the subtotal', () => {
    const coupon = Coupon.create({
      id: 'c1',
      code: 'FIVEOFF',
      discountType: 'fixed_amount',
      fixedAmountMinor: 500,
      currency: 'USD',
    });
    expect(coupon.discountAmountFor(Money.of(2000, 'USD')).amountMinor).toBe(500);
  });

  it('clamps a fixed amount larger than the subtotal down to the subtotal', () => {
    const coupon = Coupon.create({
      id: 'c1',
      code: 'BIGOFF',
      discountType: 'fixed_amount',
      fixedAmountMinor: 5000,
      currency: 'USD',
    });
    expect(coupon.discountAmountFor(Money.of(1200, 'USD')).amountMinor).toBe(1200);
  });
});

describe('Coupon limits', () => {
  const NOW = new Date('2026-08-01T12:00:00.000Z');

  function coupon(overrides: Partial<Parameters<typeof Coupon.create>[0]> = {}) {
    return Coupon.create({
      id: 'c1',
      code: 'SAVE10',
      discountType: 'percentage',
      percentageValue: 10,
      ...overrides,
    });
  }

  describe('expiry', () => {
    /**
     * A campaign code with no end date outlives the campaign — it gets posted
     * to a deals site and keeps discounting orders months later, and the only
     * way to notice is for someone to read the coupon list.
     */
    it('is usable before it expires', () => {
      expect(coupon({ expiresAt: new Date('2026-08-02T00:00:00.000Z') }).isRedeemableAt(NOW)).toBe(
        true,
      );
    });

    it('is not usable after it expires', () => {
      expect(coupon({ expiresAt: new Date('2026-07-31T00:00:00.000Z') }).isRedeemableAt(NOW)).toBe(
        false,
      );
    });

    it('treats the exact expiry instant as expired', () => {
      // The customer had until this moment, not through it.
      expect(coupon({ expiresAt: NOW }).isRedeemableAt(NOW)).toBe(false);
    });

    it('never expires when no date is set', () => {
      expect(coupon().isRedeemableAt(NOW)).toBe(true);
      expect(coupon({ expiresAt: null }).isRedeemableAt(NOW)).toBe(true);
    });
  });

  describe('redemption limit', () => {
    it('is usable below the limit', () => {
      expect(coupon({ maxRedemptions: 3, redemptionCount: 2 }).isRedeemableAt(NOW)).toBe(true);
    });

    it('is not usable once the limit is reached', () => {
      expect(coupon({ maxRedemptions: 3, redemptionCount: 3 }).isRedeemableAt(NOW)).toBe(false);
    });

    it('is not usable past the limit, which a race could produce', () => {
      expect(coupon({ maxRedemptions: 3, redemptionCount: 4 }).isRedeemableAt(NOW)).toBe(false);
    });

    it('is unlimited when no limit is set', () => {
      expect(coupon({ redemptionCount: 9_999 }).isRedeemableAt(NOW)).toBe(true);
    });

    it('refuses a limit that could never be met', () => {
      // A code that can never be used is what `isActive: false` already says,
      // more legibly — so this is a mistake worth surfacing at creation.
      expect(() => coupon({ maxRedemptions: 0 })).toThrow(/positive integer/i);
      expect(() => coupon({ maxRedemptions: -1 })).toThrow(/positive integer/i);
      expect(() => coupon({ maxRedemptions: 1.5 })).toThrow(/positive integer/i);
    });
  });

  it('is not usable when deactivated, whatever the limits say', () => {
    expect(
      coupon({ isActive: false, maxRedemptions: 100, expiresAt: null }).isRedeemableAt(NOW),
    ).toBe(false);
  });

  it('defaults to an unlimited, non-expiring, unused code', () => {
    const c = coupon();
    expect(c.expiresAt).toBeNull();
    expect(c.maxRedemptions).toBeNull();
    expect(c.redemptionCount).toBe(0);
  });
});
