import type { Money } from '@/shared/domain/money';

export interface ShippingRateRepository {
  get(): Promise<Money>;
  set(rate: Money): Promise<void>;
}
