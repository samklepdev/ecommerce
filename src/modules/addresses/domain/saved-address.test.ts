import { describe, expect, it } from 'vitest';
import { SavedAddress } from './saved-address';

function validProps() {
  return {
    id: 'addr-1',
    userId: 'user-1',
    name: 'Ada Lovelace',
    line1: '1 Test St',
    city: 'Testville',
    region: 'TS',
    postalCode: '00000',
    country: 'US',
  };
}

describe('SavedAddress.create', () => {
  it('creates a valid address, defaulting isDefault to false', () => {
    const address = SavedAddress.create(validProps());
    expect(address.name).toBe('Ada Lovelace');
    expect(address.isDefault).toBe(false);
  });

  it('honors an explicit isDefault', () => {
    const address = SavedAddress.create({ ...validProps(), isDefault: true });
    expect(address.isDefault).toBe(true);
  });

  it.each(['name', 'line1', 'city', 'postalCode', 'country'] as const)(
    'rejects an empty %s',
    (field) => {
      const props = { ...validProps(), [field]: '' };
      expect(() => SavedAddress.create(props)).toThrow();
    },
  );

  it('does not require region to be non-empty', () => {
    expect(() => SavedAddress.create({ ...validProps(), region: '' })).not.toThrow();
  });
});
