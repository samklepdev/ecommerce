import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { DrizzleCouponRepository } from './drizzle-coupon-repository';
import { Coupon } from '@/modules/coupons/domain/coupon';
import { coupons } from '@/shared/infrastructure/db/schema';
import type { DB } from '@/shared/infrastructure/db/client';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * The redemption limit, against real SQL.
 *
 * It cannot be enforced by reading the coupon and deciding — two simultaneous
 * checkouts both read "0 used, limit 1" and both proceed, which is the whole
 * thing a limit is for. The enforcement is one conditional `UPDATE`, so it is
 * Postgres that decides, and only Postgres can demonstrate it.
 */
describe('DrizzleCouponRepository#redeem (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleCouponRepository(db as DB);

  const NOW = new Date('2026-08-01T12:00:00.000Z');

  let n = 0;
  async function seedCoupon(overrides: {
    expiresAt?: Date | null;
    maxRedemptions?: number | null;
    redemptionCount?: number;
    isActive?: boolean;
  } = {}) {
    n += 1;
    const code = `SAVE${n}`;
    await repo().create(
      Coupon.create({
        id: `coupon-${n}`,
        code,
        discountType: 'percentage',
        percentageValue: 10,
        expiresAt: overrides.expiresAt ?? null,
        maxRedemptions: overrides.maxRedemptions ?? null,
        isActive: overrides.isActive ?? true,
      }),
    );
    if (overrides.redemptionCount) {
      await db
        .update(coupons)
        .set({ redemptionCount: overrides.redemptionCount })
        .where(eq(coupons.code, code));
    }
    return code;
  }

  async function countFor(code: string) {
    const [row] = await db
      .select({ c: coupons.redemptionCount })
      .from(coupons)
      .where(eq(coupons.code, code));
    return row?.c;
  }

  it('redeems an unlimited coupon and counts it', async () => {
    const code = await seedCoupon();

    expect(await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })).toBe(true);
    expect(await countFor(code)).toBe(1);
  });

  it('redeems up to the limit and refuses past it', async () => {
    const code = await seedCoupon({ maxRedemptions: 2 });

    expect(await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })).toBe(true);
    expect(await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })).toBe(true);
    expect(await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })).toBe(false);
    // And the refused attempt did not increment past the limit.
    expect(await countFor(code)).toBe(2);
  });

  /**
   * The reason this is one statement. Ten callers race for a single
   * redemption; exactly one may win, and the count must land on 1 — not 10,
   * and not somewhere in between from lost updates.
   */
  it('lets exactly one of many concurrent callers take the last redemption', async () => {
    const code = await seedCoupon({ maxRedemptions: 1 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await countFor(code)).toBe(1);
  });

  it('lets exactly three through when three are on offer', async () => {
    const code = await seedCoupon({ maxRedemptions: 3 });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await countFor(code)).toBe(3);
  });

  it('refuses an expired coupon without counting it', async () => {
    const code = await seedCoupon({ expiresAt: new Date('2026-07-31T00:00:00.000Z') });

    expect(await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })).toBe(false);
    expect(await countFor(code)).toBe(0);
  });

  it('redeems one that has not expired yet', async () => {
    const code = await seedCoupon({ expiresAt: new Date('2026-08-02T00:00:00.000Z') });

    expect(await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })).toBe(true);
  });

  it('refuses a deactivated coupon', async () => {
    const code = await seedCoupon({ isActive: false });

    expect(await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' })).toBe(false);
    expect(await countFor(code)).toBe(0);
  });

  it('refuses a code that does not exist', async () => {
    expect(await repo().redeem({ code: 'NOSUCHCODE', now: NOW, customerEmail: 'buyer@example.com' })).toBe(false);
  });

  it('matches the code case-insensitively, like every other lookup', async () => {
    const code = await seedCoupon();

    expect(await repo().redeem({ code: code.toLowerCase(), now: NOW, customerEmail: 'buyer@example.com' })).toBe(true);
  });

  it('reads the count back onto the domain object', async () => {
    // `isRedeemableAt` is what produces the good error message while the
    // customer still has their cart, so it needs the real count.
    const code = await seedCoupon({ maxRedemptions: 1 });
    await repo().redeem({ code: code, now: NOW, customerEmail: 'buyer@example.com' });

    const found = await repo().findByCode(code);

    expect(found?.redemptionCount).toBe(1);
    expect(found?.isRedeemableAt(NOW)).toBe(false);
  });

  describe('the per-customer limit', () => {
    /**
     * `maxRedemptions` stops a leaked code being used a thousand times; it
     * does nothing about one person using it a hundred. A "one per customer"
     * welcome code had no way to say so.
     */
    async function seedPerCustomer(maxPerCustomer: number, maxRedemptions?: number) {
      n += 1;
      const code = `PER${n}`;
      await repo().create(
        Coupon.create({
          id: `coupon-per-${n}`,
          code,
          discountType: 'percentage',
          percentageValue: 10,
          maxPerCustomer,
          maxRedemptions: maxRedemptions ?? null,
        }),
      );
      return code;
    }

    const redeem = (code: string, email: string) =>
      repo().redeem({ code, now: NOW, customerEmail: email });

    it('lets one customer redeem up to their limit', async () => {
      const code = await seedPerCustomer(2);

      expect(await redeem(code, 'a@example.com')).toBe(true);
      expect(await redeem(code, 'a@example.com')).toBe(true);
      expect(await redeem(code, 'a@example.com')).toBe(false);
    });

    it('does not count one customer against another', async () => {
      const code = await seedPerCustomer(1);

      expect(await redeem(code, 'a@example.com')).toBe(true);
      expect(await redeem(code, 'b@example.com')).toBe(true);
      expect(await redeem(code, 'a@example.com')).toBe(false);
    });

    it('treats the same address in different case as the same customer', async () => {
      // Otherwise the limit is bypassed by pressing shift.
      const code = await seedPerCustomer(1);

      expect(await redeem(code, 'a@example.com')).toBe(true);
      expect(await redeem(code, 'A@Example.COM')).toBe(false);
      expect(await redeem(code, '  a@example.com  ')).toBe(false);
    });

    /**
     * The reason this is a unique index and not a count-then-insert. Ten
     * simultaneous checkouts by one customer for a one-per-customer code: they
     * all compute the same slot, all insert, and Postgres rejects nine.
     */
    it('lets exactly one of many concurrent redemptions by one customer through', async () => {
      const code = await seedPerCustomer(1);

      const results = await Promise.all(
        Array.from({ length: 10 }, () => redeem(code, 'racer@example.com')),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('lets exactly three through when three are on offer', async () => {
      const code = await seedPerCustomer(3);

      const results = await Promise.all(
        Array.from({ length: 15 }, () => redeem(code, 'racer@example.com')),
      );

      expect(results.filter(Boolean)).toHaveLength(3);
    });

    it('still honours the global cap, which remains the hard ceiling', async () => {
      // Two customers each allowed one, but only one redemption exists at all.
      const code = await seedPerCustomer(1, 1);

      expect(await redeem(code, 'a@example.com')).toBe(true);
      expect(await redeem(code, 'b@example.com')).toBe(false);
    });

    it('is unlimited per customer when no limit is set', async () => {
      // The default, and what every existing coupon is: the global cap alone.
      const code = await seedCoupon();

      expect(await redeem(code, 'a@example.com')).toBe(true);
      expect(await redeem(code, 'a@example.com')).toBe(true);
      expect(await redeem(code, 'a@example.com')).toBe(true);
    });
  });
});
