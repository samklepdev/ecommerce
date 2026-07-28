import { z } from 'zod';

/**
 * A URL that's safe to fetch or render as a link.
 *
 * `z.string().url()` alone accepts `javascript:`, `data:` and `file:` —
 * fine for a spec-compliant URL parser, not fine here. These values are
 * fetched server-side (supplier feeds, the paste-a-product-URL helper) and
 * rendered as admin links, so the scheme is restricted to http(s).
 *
 * Note this is a scheme check, not an SSRF defence: an `http://` URL can
 * still point at a private address. Guarding that belongs with the fetcher.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Enter an http or https URL.' },
  );
