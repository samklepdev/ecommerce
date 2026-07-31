import { eq } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { coupons } from '@/shared/infrastructure/db/schema';
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
    createdAt: row.createdAt,
  });
}

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

  async create(coupon: Coupon): Promise<void> {
    await this.db.insert(coupons).values({
      id: coupon.id,
      code: coupon.code,
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
