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
