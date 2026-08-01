import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { refineAddress } from './address-schema';
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
