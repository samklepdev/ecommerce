import { describe, expect, it } from 'vitest';
import { SupplierOffer } from './supplier-offer';
import { Money } from '@/shared/domain/money';

function validProps() {
  return {
    id: '1',
    productId: 'v1',
    supplierId: 's1',
    supplierProductUrl: 'https://supplier.example.com/item',
    cost: Money.of(1000, 'USD'),
    isAvailable: true,
    isPreferred: false,
  };
}

describe('SupplierOffer.create', () => {
  it('creates an offer with a non-empty supplierProductUrl', () => {
    const offer = SupplierOffer.create(validProps());
    expect(offer.supplierProductUrl).toBe('https://supplier.example.com/item');
  });

  it('throws on an empty supplierProductUrl', () => {
    expect(() => SupplierOffer.create({ ...validProps(), supplierProductUrl: '' })).toThrow(
      'non-empty supplierProductUrl',
    );
  });

  it('throws on a whitespace-only supplierProductUrl', () => {
    expect(() => SupplierOffer.create({ ...validProps(), supplierProductUrl: '   ' })).toThrow(
      'non-empty supplierProductUrl',
    );
  });
});
