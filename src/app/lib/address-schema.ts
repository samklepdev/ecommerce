import { z } from 'zod';

import { COMMON_COUNTRIES, US_STATES } from '@/shared/domain/address-options';
import { normalizePostalCode, validatePostalCode } from '@/shared/domain/postal-code';

const COUNTRY_CODES = new Set(COMMON_COUNTRIES.map((c) => c.code));
const US_STATE_CODES = new Set(US_STATES.map((s) => s.code));

/** ISO alpha-2, and one this storefront actually ships to. The form is a
 * `<select>` built from the same list, so anything else arrived by editing
 * the request. */
export const countrySchema = z
  .string({
    required_error: 'Choose a country we ship to.',
    invalid_type_error: 'Choose a country we ship to.',
  })
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => COUNTRY_CODES.has(v), { message: 'Choose a country we ship to.' });

export const postalCodeSchema = z
  .string({
    required_error: 'Enter a postal code.',
    invalid_type_error: 'Enter a postal code.',
  })
  .transform(normalizePostalCode);

/**
 * Field ceilings. Not business rules — every address column is `text` (and
 * the order's snapshot is `jsonb`), so nothing below this line says no, and a
 * 100 kB name is a shipping label that can't be printed. Generous enough that
 * no real address is near them.
 */
export const ADDRESS_MAX_LENGTH = {
  name: 120,
  line1: 200,
  line2: 200,
  city: 100,
  region: 100,
} as const;

/**
 * Trimmed first, then required — `min(1)` on its own accepts `"   "`, which
 * used to pass the schema and throw inside `ShippingAddress.create`, turning
 * a field error into a 500.
 */
function requiredText(max: number, missing: string, subject: string) {
  return z
    .string({ required_error: missing, invalid_type_error: missing })
    .trim()
    .min(1, missing)
    .max(max, `${subject} can't be longer than ${max} characters.`);
}

function optionalText(max: number, subject: string) {
  return z
    .string()
    .trim()
    .max(max, `${subject} can't be longer than ${max} characters.`)
    .optional();
}

/**
 * The address fields, shared by every form that writes one.
 *
 * Spread into an object schema and follow it with `refineAddress` — the
 * per-field rules can't see each other, and postal format and US region both
 * depend on the country.
 */
export const addressFieldSchemas = {
  name: requiredText(ADDRESS_MAX_LENGTH.name, 'Enter a name.', 'A name'),
  line1: requiredText(ADDRESS_MAX_LENGTH.line1, 'Enter the first line of the address.', 'An address line'),
  line2: optionalText(ADDRESS_MAX_LENGTH.line2, 'An address line'),
  city: requiredText(ADDRESS_MAX_LENGTH.city, 'Enter a city.', 'A city'),
  region: optionalText(ADDRESS_MAX_LENGTH.region, 'A region'),
  postalCode: postalCodeSchema,
  country: countrySchema,
};

/**
 * Stored the way the form's own `<option>` carries it.
 *
 * A US region is a 2-letter code, and the check upper-cases only to compare —
 * so `"tx"` validated and was stored raw. Autofilling from it then set
 * `<select value="tx">`, which matches no option, so the browser rendered the
 * placeholder and the field submitted *empty*: the saved address was silently
 * unusable and checkout failed with a generic error. Elsewhere `region` is a
 * free-text province and upper-casing it would be wrong, so only the US case
 * is folded.
 */
export function normalizeRegion(region: string, country: string): string {
  const trimmed = region.trim().replace(/\s+/g, ' ');
  return country.trim().toUpperCase() === 'US' ? trimmed.toUpperCase() : trimmed;
}

/** One complete address, validated and normalised: what `AddSavedAddress`,
 * `UpdateSavedAddress` and the admin's order-contact editor all write. */
export const addressSchema = z
  .object(addressFieldSchemas)
  .superRefine((data, ctx) => refineAddress(data, ctx))
  .transform((data) => ({
    ...data,
    region: data.region === undefined ? undefined : normalizeRegion(data.region, data.country),
  }));

/**
 * Address fields that have to agree with each other, checked together.
 *
 * Postal format depends on the country, and a US region has to be a real
 * state code — neither can be decided by looking at one field alone, which
 * is why this is a `superRefine` over the object rather than per-field
 * rules.
 */
export function refineAddress<T extends { country: string; region?: string; postalCode: string }>(
  data: T,
  ctx: z.RefinementCtx,
  /** Maps a logical field to the form's actual field name. Checkout
   * namespaces its inputs (`shippingPostalCode`), and an issue has to land
   * on the field the form knows about or the message has nowhere to show. */
  fieldName: (field: 'postalCode' | 'region') => string = (field) => field,
): void {
  const problem = validatePostalCode(data.postalCode, data.country);
  if (problem) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: problem,
      path: [fieldName('postalCode')],
    });
  }

  // Only the US has a canonical list here. Elsewhere "region" is a
  // free-text province/county and validating it would reject real addresses.
  if (data.country === 'US') {
    const region = (data.region ?? '').trim().toUpperCase();
    if (!US_STATE_CODES.has(region)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a US state.',
        path: [fieldName('region')],
      });
    }
  }
}
