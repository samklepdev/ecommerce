import { describe, expect, it } from 'vitest';
import { ShippingAddress } from './shipping-address';

function validProps() {
  return {
    name: 'Ada Lovelace',
    line1: '1 Test St',
    city: 'Testville',
    region: 'TS',
    postalCode: '00000',
    country: 'US',
  };
}

describe('ShippingAddress.create', () => {
  it('creates a valid address', () => {
    const address = ShippingAddress.create(validProps());
    expect(address.name).toBe('Ada Lovelace');
    expect(address.line2).toBeUndefined();
  });

  it('accepts an optional line2', () => {
    const address = ShippingAddress.create({ ...validProps(), line2: 'Apt 4' });
    expect(address.line2).toBe('Apt 4');
  });

  it.each(['name', 'line1', 'city', 'postalCode', 'country'] as const)(
    'rejects an empty %s',
    (field) => {
      const props = { ...validProps(), [field]: '' };
      expect(() => ShippingAddress.create(props)).toThrow();
    },
  );

  it.each(['name', 'line1', 'city', 'postalCode', 'country'] as const)(
    'rejects a whitespace-only %s',
    (field) => {
      const props = { ...validProps(), [field]: '   ' };
      expect(() => ShippingAddress.create(props)).toThrow();
    },
  );

  it('does not require region to be non-empty', () => {
    expect(() => ShippingAddress.create({ ...validProps(), region: '' })).not.toThrow();
  });

  /**
   * The schemas above this trim, but the value object is what the snapshot is
   * built from and it is reachable from any caller. Padding that survives to
   * here is padding on a shipping label.
   */
  it('trims every field it keeps', () => {
    const address = ShippingAddress.create({
      name: '  Ada Lovelace  ',
      line1: ' 1 Test St ',
      line2: '  Apt 4 ',
      city: ' Testville ',
      region: ' TS ',
      postalCode: ' 00000 ',
      country: ' US ',
    });

    expect(address.toJSON()).toEqual({
      name: 'Ada Lovelace',
      line1: '1 Test St',
      line2: 'Apt 4',
      city: 'Testville',
      region: 'TS',
      postalCode: '00000',
      country: 'US',
    });
  });

  it('keeps an absent line2 absent rather than making it an empty string', () => {
    expect(ShippingAddress.create(validProps()).line2).toBeUndefined();
    // A line2 of nothing but spaces is nothing.
    expect(ShippingAddress.create({ ...validProps(), line2: '   ' }).line2).toBeUndefined();
  });
});

describe('ShippingAddress#toJSON', () => {
  it('round-trips the same plain props', () => {
    const props = validProps();
    const address = ShippingAddress.create(props);
    expect(address.toJSON()).toEqual(props);
  });
});
