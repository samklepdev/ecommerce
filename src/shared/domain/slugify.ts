/** Converts arbitrary text into a URL-safe slug candidate — lowercase,
 * alphanumeric runs joined by single hyphens, no leading/trailing hyphen.
 * A candidate, not a guarantee of uniqueness; callers still check for
 * collisions before persisting. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
