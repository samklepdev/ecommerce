import { z } from 'zod';

/**
 * The fiat price of one BTC, from the rate feed.
 *
 * Worth validating rather than casting because this number decides how many
 * satoshis a customer is asked to send. The previous `as Record<string,
 * number>` plus a `!price || price <= 0` check let a string through — a
 * quoted `"60000"` divides by coercion and happens to work, while `"abc"`
 * gives NaN, and NaN sats is an invoice nobody can pay correctly.
 */
const PricesSchema = z.record(z.string(), z.unknown());
const PriceSchema = z.number().finite().positive();

export function parseBtcPrice(raw: unknown, currency: string): number {
  const prices = PricesSchema.safeParse(raw);
  // Arrays pass `z.record` in some versions; a price table is never a list.
  if (!prices.success || Array.isArray(raw)) {
    throw new Error('rate feed returned an unexpected response');
  }

  const price = PriceSchema.safeParse(prices.data[currency]);
  if (!price.success) {
    throw new Error(`rate feed has no usable BTC price for ${currency}`);
  }
  return price.data;
}
