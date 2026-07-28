/**
 * Postal-code validation, per country where there's a rule worth encoding.
 *
 * Deliberately not exhaustive. Only countries whose format is stable and
 * well known get a pattern; everything else falls back to "present and a
 * plausible length". Inventing a regex for a country nobody here has
 * checked would reject real addresses, and a rejected delivery address is a
 * worse outcome than a loosely-validated one.
 */

const MAX_POSTAL_CODE_LENGTH = 12;

const PATTERNS: Record<string, { pattern: RegExp; label: string }> = {
  // 12345 or 12345-6789
  US: { pattern: /^\d{5}(-\d{4})?$/, label: 'a 5-digit ZIP code, optionally +4' },
  // A1A 1A1, space optional
  CA: { pattern: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/, label: 'a postal code like K1A 0B1' },
  // The full UK format, loosely: outward code, space, inward code
  GB: { pattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/, label: 'a postcode like SW1A 1AA' },
  AU: { pattern: /^\d{4}$/, label: 'a 4-digit postcode' },
  DE: { pattern: /^\d{5}$/, label: 'a 5-digit postal code' },
  FR: { pattern: /^\d{5}$/, label: 'a 5-digit postal code' },
};

/** Upper-cased, trimmed, with internal whitespace collapsed — so `k1a  0b1`
 * and `K1A 0B1` are stored the same way and compare equal. */
export function normalizePostalCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Returns a message describing the problem, or null when acceptable.
 *
 * `country` is an ISO-3166 alpha-2 code, matched case-insensitively.
 */
export function validatePostalCode(raw: string, country: string): string | null {
  const value = normalizePostalCode(raw);

  if (value === '') return 'Enter a postal code.';
  if (value.length > MAX_POSTAL_CODE_LENGTH) {
    return `A postal code can't be longer than ${MAX_POSTAL_CODE_LENGTH} characters.`;
  }

  const rule = PATTERNS[country.trim().toUpperCase()];
  if (!rule) return null;

  return rule.pattern.test(value) ? null : `Enter ${rule.label}.`;
}
