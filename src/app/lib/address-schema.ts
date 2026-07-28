import { z } from 'zod';

import { COMMON_COUNTRIES, US_STATES } from '@/shared/domain/address-options';
import { normalizePostalCode, validatePostalCode } from '@/shared/domain/postal-code';

const COUNTRY_CODES = new Set(COMMON_COUNTRIES.map((c) => c.code));
const US_STATE_CODES = new Set(US_STATES.map((s) => s.code));

/** ISO alpha-2, and one this storefront actually ships to. The form is a
 * `<select>` built from the same list, so anything else arrived by editing
 * the request. */
export const countrySchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => COUNTRY_CODES.has(v), { message: 'Choose a country we ship to.' });

export const postalCodeSchema = z.string().transform(normalizePostalCode);

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
