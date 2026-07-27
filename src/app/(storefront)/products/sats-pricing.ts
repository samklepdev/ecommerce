/** Sats-denominated display prices for the catalog. */

const satsFormat = new Intl.NumberFormat('en-US');

/**
 * Formats a minor-unit fiat amount as whole sats.
 *
 * Rounded, and deliberately not exact: this is a browsing aid next to the
 * fiat price, not a quote. The binding number is the one the payment gateway
 * locks at checkout — see `StartCheckout`.
 */
export function formatSats(amountMinor: number, satsPerFiatUnit: number): string {
  const sats = Math.round((amountMinor / 100) * satsPerFiatUnit);
  return `${satsFormat.format(sats)} sats`;
}

/**
 * The current rate, or `null` if the feed is unavailable.
 *
 * The catalog is the storefront's busiest page and this is decoration on it,
 * so a price-feed outage must degrade to fiat-only rather than take the page
 * down. Callers treat `null` as "show fiat alone".
 */
export async function tryGetSatsRate(
  rates: { satsPerFiatUnit(currency: string): Promise<number> },
  currency: string,
): Promise<number | null> {
  try {
    return await rates.satsPerFiatUnit(currency);
  } catch {
    return null;
  }
}
