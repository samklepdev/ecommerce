import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ADDRESS_MAX_LENGTH, addressSchema, refineAddress } from './address-schema';
import { US_STATES } from '@/shared/domain/address-options';

/** A minimal schema shaped like the real forms', so `refineAddress` is
 * exercised the way checkout and saved addresses exercise it. */
const AddressSchema = z
  .object({
    country: z.string(),
    region: z.string().optional(),
    postalCode: z.string(),
  })
  .superRefine((data, ctx) => refineAddress(data, ctx));

function accepts(address: { country: string; region?: string; postalCode: string }) {
  return AddressSchema.safeParse(address).success;
}

describe('US territories and military addresses', () => {
  /**
   * These were rejected outright: `US_STATES` held only the 50 states and DC,
   * and that list is the *only* thing the US region check consults — so a
   * Puerto Rico customer got "Choose a US state" with no way through, and the
   * territory wasn't in the country list either. USPS delivers to all of these
   * at domestic rates.
   */
  it.each([
    ['PR', '00901', 'Puerto Rico'],
    ['VI', '00802', 'U.S. Virgin Islands'],
    ['GU', '96910', 'Guam'],
    ['AS', '96799', 'American Samoa'],
    ['MP', '96950', 'Northern Mariana Islands'],
  ])('accepts a %s address (%s)', (region, postalCode) => {
    expect(accepts({ country: 'US', region, postalCode })).toBe(true);
  });

  it.each([
    ['AA', '34035', 'Armed Forces Americas'],
    ['AE', '09123', 'Armed Forces Europe'],
    ['AP', '96201', 'Armed Forces Pacific'],
  ])('accepts an APO/FPO address in %s (%s)', (region, postalCode) => {
    // The "state" encodes a theatre rather than a place; a service member
    // shipping to APO/FPO is a normal domestic shipment.
    expect(accepts({ country: 'US', region, postalCode })).toBe(true);
  });

  it('still rejects a region that is not a real US code', () => {
    expect(accepts({ country: 'US', region: 'ZZ', postalCode: '77002' })).toBe(false);
    expect(accepts({ country: 'US', region: 'Texas', postalCode: '77002' })).toBe(false);
  });

  it('still requires a region for a US address', () => {
    expect(accepts({ country: 'US', postalCode: '77002' })).toBe(false);
  });

  it('keeps every state code unique', () => {
    // A duplicate would render two identical <option>s and, worse, suggest the
    // list was edited carelessly.
    const codes = US_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('lists 50 states + DC + 8 territories + 3 military codes', () => {
    expect(US_STATES).toHaveLength(62);
  });
});

describe('addressSchema', () => {
  function validAddress() {
    return {
      name: 'Jamie Rivera',
      line1: '14 Bridge Street',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    };
  }

  it('accepts a complete address', () => {
    const parsed = addressSchema.safeParse(validAddress());
    expect(parsed.success).toBe(true);
  });

  /**
   * `min(1)` accepts `"   "`. The address then reached
   * `ShippingAddress.create`, which threw *inside* the use case — a 500 in
   * place of a field error, on the one form standing between a customer and
   * an irreversible payment.
   */
  it.each(['name', 'line1', 'city'] as const)('rejects a whitespace-only %s', (field) => {
    const parsed = addressSchema.safeParse({ ...validAddress(), [field]: '   ' });
    expect(parsed.success).toBe(false);
  });

  it.each(['name', 'line1', 'city'] as const)('trims a padded %s rather than storing it', (field) => {
    const parsed = addressSchema.safeParse({ ...validAddress(), [field]: '  Padded  ' });
    expect(parsed.success && parsed.data[field]).toBe('Padded');
  });

  it('rejects a whitespace-only postal code', () => {
    expect(addressSchema.safeParse({ ...validAddress(), postalCode: '   ' }).success).toBe(false);
  });

  /**
   * Every field is `text`/`jsonb`, so nothing in the database says no. An
   * unbounded name reaches a shipping label.
   */
  it.each([
    ['name', ADDRESS_MAX_LENGTH.name],
    ['line1', ADDRESS_MAX_LENGTH.line1],
    ['line2', ADDRESS_MAX_LENGTH.line2],
    ['city', ADDRESS_MAX_LENGTH.city],
  ] as const)('rejects a %s longer than %i characters', (field, max) => {
    expect(addressSchema.safeParse({ ...validAddress(), [field]: 'a'.repeat(max + 1) }).success).toBe(
      false,
    );
    expect(addressSchema.safeParse({ ...validAddress(), [field]: 'a'.repeat(max) }).success).toBe(true);
  });

  it('bounds a non-US region', () => {
    const base = { ...validAddress(), country: 'DE', postalCode: '10115' };
    const max = ADDRESS_MAX_LENGTH.region;
    expect(addressSchema.safeParse({ ...base, region: 'a'.repeat(max + 1) }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, region: 'a'.repeat(max) }).success).toBe(true);
  });

  /**
   * A saved `"tx"` was accepted (the US check upper-cases only to compare)
   * and stored raw. Autofill then set `<select value="tx">`, which matches no
   * option, so the field submitted empty and checkout failed with a generic
   * error — the saved address was silently unusable.
   */
  it('normalises a US region to the code the form option carries', () => {
    const parsed = addressSchema.safeParse({ ...validAddress(), region: 'tx' });
    expect(parsed.success && parsed.data.region).toBe('TX');
  });

  it('trims a region', () => {
    const parsed = addressSchema.safeParse({ ...validAddress(), region: ' tx ' });
    expect(parsed.success && parsed.data.region).toBe('TX');
  });

  it('leaves a non-US region as written apart from trimming', () => {
    const parsed = addressSchema.safeParse({
      name: 'Jamie Rivera',
      line1: '14 Bridge Street',
      city: 'Munich',
      region: '  Bayern ',
      postalCode: '80331',
      country: 'DE',
    });
    expect(parsed.success && parsed.data.region).toBe('Bayern');
  });

  it('normalises the postal code and the country', () => {
    const parsed = addressSchema.safeParse({
      ...validAddress(),
      city: 'Toronto',
      region: 'Ontario',
      postalCode: ' k1a  0b1 ',
      country: ' ca ',
    });
    expect(parsed.success && parsed.data.postalCode).toBe('K1A 0B1');
    expect(parsed.success && parsed.data.country).toBe('CA');
  });

  it('rejects a country this shop does not ship to', () => {
    expect(addressSchema.safeParse({ ...validAddress(), country: 'Narnia' }).success).toBe(false);
  });

  it('rejects a region that is not a US state code', () => {
    expect(addressSchema.safeParse({ ...validAddress(), region: 'ZZ' }).success).toBe(false);
  });

  it('rejects a postal code the country pattern refuses', () => {
    expect(addressSchema.safeParse({ ...validAddress(), postalCode: '-' }).success).toBe(false);
  });
});
