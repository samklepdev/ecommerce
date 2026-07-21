import { eq } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { shippingRates } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';

const SINGLETON_ID = 'default';

export class DrizzleShippingRateRepository implements ShippingRateRepository {
  constructor(private readonly db: DB) {}

  async get(): Promise<Money> {
    const row = await this.db.query.shippingRates.findFirst({
      where: eq(shippingRates.id, SINGLETON_ID),
    });
    // No row yet means no admin has ever configured a rate — default to
    // free shipping rather than erroring.
    if (!row) return Money.zero('USD');
    return Money.of(row.amountMinor, row.currency);
  }

  async set(rate: Money): Promise<void> {
    await this.db
      .insert(shippingRates)
      .values({ id: SINGLETON_ID, amountMinor: rate.amountMinor, currency: rate.currency, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: shippingRates.id,
        set: { amountMinor: rate.amountMinor, currency: rate.currency, updatedAt: new Date() },
      });
  }
}
