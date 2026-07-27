/** Display formatting for the analytics dashboard.
 *
 * Every formatter pins `en-US` explicitly. These render on the server and
 * hydrate on the client, and a separator or month name that differs between
 * the two is a hydration mismatch. */

const countFormat = new Intl.NumberFormat('en-US');

export function formatCount(n: number): string {
  return countFormat.format(n);
}

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Jul 25" from a `YYYY-MM-DD` day key. */
export function shortDay(dayKey: string): string {
  return dayFormat.format(new Date(`${dayKey}T00:00:00Z`));
}

const rangeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatRangeDate(d: Date): string {
  return rangeFormat.format(d);
}

/**
 * Axis-scale money: "$4k" once past a thousand units, "$525" below it.
 *
 * Takes minor units like everything else that touches money, and divides
 * only at the point of display.
 */
export function compactMoney(amountMinor: number, currency: string): string {
  const units = amountMinor / 100;
  const thousands = Math.abs(units) >= 1000;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    notation: thousands ? 'compact' : 'standard',
    compactDisplay: 'short',
  })
    .format(thousands ? units : Math.round(units))
    .replace('K', 'k');
}

/** "bc1qxy2k…hx0wlh" — enough of both ends to eyeball against a block
 * explorer without letting one column own the table's width. The full
 * address stays available as the cell's title. */
export function truncateAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
