import { randomUUID } from 'node:crypto';

import { and, count as countRows, eq, gt, isNull, or, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { couponRedemptions, coupons } from '@/shared/infrastructure/db/schema';
import { Coupon, type CouponDiscountType } from '@/modules/coupons/domain/coupon';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

type Row = typeof coupons.$inferSelect;

function toCoupon(row: Row): Coupon {
  return Coupon.create({
    id: row.id,
    code: row.code,
    discountType: row.discountType as CouponDiscountType,
    percentageValue: row.percentageValue ?? undefined,
    fixedAmountMinor: row.fixedAmountMinor ?? undefined,
    currency: row.currency ?? undefined,
    isActive: row.isActive,
    maxPerCustomer: row.maxPerCustomer,
    expiresAt: row.expiresAt,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    createdAt: row.createdAt,
  });
}

/**
 * Extra attempts allowed on top of the customer's own allowance when slots are
 * being contended. Enough to absorb a burst of simultaneous clicks; small
 * enough that a pathological caller gives up rather than spinning.
 */
const MAX_SLOT_CONTENTION = 10;

export class DrizzleCouponRepository implements CouponRepository {
  constructor(private readonly db: DB) {}

  async list(): Promise<Coupon[]> {
    const rows = await this.db.query.coupons.findMany({
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });
    return rows.map(toCoupon);
  }

  async findByCode(code: string): Promise<Coupon | null> {
    const normalized = code.trim().toUpperCase();
    const row = await this.db.query.coupons.findFirst({
      where: eq(coupons.code, normalized),
    });
    return row ? toCoupon(row) : null;
  }

  async findById(id: string): Promise<Coupon | null> {
    const row = await this.db.query.coupons.findFirst({ where: eq(coupons.id, id) });
    return row ? toCoupon(row) : null;
  }

  /**
   * One statement, so the limit holds under concurrency.
   *
   * Every condition lives in the `WHERE`: the increment happens only if the
   * row still satisfies all of them at the moment Postgres applies it. Reading
   * the coupon and then deciding would let two simultaneous checkouts both see
   * "0 used, limit 1" and both proceed — which is the whole point of having a
   * limit.
   */
  /**
   * Consume one redemption, atomically, on both limits.
   *
   * Two separate guarantees, because they need different mechanisms:
   *
   * The **global** cap is a conditional `UPDATE` — every condition lives in
   * the `WHERE`, so the increment happens only if the row still satisfies them
   * when Postgres applies it.
   *
   * The **per-customer** cap can't work that way: it counts rows that don't
   * exist yet. Instead each redemption claims an explicit slot — 0, then 1,
   * then 2 — and `(couponId, customerKey, slot)` is unique, so two checkouts
   * racing for the same slot collide on the index and exactly one survives.
   * The loser is treated as "no redemption left", which is the truth.
   *
   * Ordered per-customer first: it is the cheaper claim to give back. If the
   * global increment then fails the customer's slot row is orphaned, which
   * costs them one of their allowance — bad, but strictly better than the
   * reverse, where a global redemption is consumed by a customer who is not
   * allowed one and nobody gets it.
   */
  async redeem(input: { code: string; now: Date; customerEmail: string }): Promise<boolean> {
    const normalized = input.code.trim().toUpperCase();
    const coupon = await this.findByCode(normalized);
    if (!coupon) return false;

    if (coupon.maxPerCustomer !== null) {
      const claimed = await this.claimCustomerSlot(
        coupon.id,
        input.customerEmail,
        coupon.maxPerCustomer,
      );
      if (!claimed) return false;
    }

    const result = await this.db
      .update(coupons)
      .set({ redemptionCount: sql`${coupons.redemptionCount} + 1` })
      .where(
        and(
          eq(coupons.code, normalized),
          eq(coupons.isActive, true),
          or(isNull(coupons.expiresAt), gt(coupons.expiresAt, input.now)),
          or(
            isNull(coupons.maxRedemptions),
            sql`${coupons.redemptionCount} < ${coupons.maxRedemptions}`,
          ),
        ),
      )
      .returning({ id: coupons.id });
    return result.length > 0;
  }

  /**
   * Take this customer's next slot for a coupon, or report that they have none
   * left.
   *
   * The insert is what enforces the limit, not the count: counting and then
   * deciding lets two simultaneous checkouts both see the same number. Here
   * they both compute the same slot, both insert, and the unique index rejects
   * one of them.
   *
   * A collision is **retried**, not refused. Refusing looks safer and is
   * simply wrong: the loser of a race has not necessarily used up their
   * allowance, so a customer permitted three could be cut off after one by
   * clicking quickly. The retry re-counts before each attempt, so it can never
   * exceed the cap — the count is the ceiling and the index is the mutex, and
   * both have to hold for the number to come out right.
   *
   * Bounded because contention here is one customer double-clicking, not a
   * crowd; a loop that could spin forever on the request thread would be a
   * worse failure than refusing.
   */
  private async claimCustomerSlot(
    couponId: string,
    customerEmail: string,
    maxPerCustomer: number,
  ): Promise<boolean> {
    const customerKey = customerEmail.trim().toLowerCase();

    for (let attempt = 0; attempt < maxPerCustomer + MAX_SLOT_CONTENTION; attempt += 1) {
      const [row] = await this.db
        .select({ used: countRows() })
        .from(couponRedemptions)
        .where(
          and(
            eq(couponRedemptions.couponId, couponId),
            eq(couponRedemptions.customerKey, customerKey),
          ),
        );
      const used = Number(row?.used ?? 0);
      if (used >= maxPerCustomer) return false;

      try {
        await this.db.insert(couponRedemptions).values({
          id: randomUUID(),
          couponId,
          customerKey,
          slot: used,
        });
        return true;
      } catch {
        // Unique violation: another checkout for this customer took this slot
        // in between. Loop round — the re-count is what keeps the cap honest.
      }
    }

    return false;
  }

  async create(coupon: Coupon): Promise<void> {
    await this.db.insert(coupons).values({
      id: coupon.id,
      code: coupon.code,
      expiresAt: coupon.expiresAt,
      maxRedemptions: coupon.maxRedemptions,
      maxPerCustomer: coupon.maxPerCustomer,
      discountType: coupon.discountType,
      percentageValue: coupon.percentageValue,
      fixedAmountMinor: coupon.fixedAmountMinor,
      currency: coupon.currency,
      isActive: coupon.isActive,
    });
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db.update(coupons).set({ isActive }).where(eq(coupons.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(coupons).where(eq(coupons.id, id));
  }
}
