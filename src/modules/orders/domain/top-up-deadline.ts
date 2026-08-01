/**
 * When a part-paying customer's window to send the balance closes.
 *
 * `AWAITING_CONFIRMATION_WINDOW_HOURS` measured from when money was first seen
 * on-chain. Past it `FailStuckAwaitingConfirmationOrders` moves the order to
 * `failed`, which is terminal — and with no refund mechanism, whatever they
 * already sent is gone.
 *
 * Null when the clock was never stamped, so callers can omit the deadline
 * rather than invent one.
 */
export function topUpDeadlineAt(
  awaitingConfirmationSince: Date | null,
  windowHours: number,
): Date | null {
  if (!awaitingConfirmationSince) return null;
  return new Date(awaitingConfirmationSince.getTime() + windowHours * 3_600_000);
}

/**
 * The deadline as a customer-readable string, in UTC and labelled as such.
 *
 * Explicitly UTC because this is rendered on a server whose timezone the
 * customer does not share, and both surfaces that show it — the balance email
 * and the order page — render server-side. A deadline silently several hours
 * out is worse than none when missing it is irreversible.
 *
 * Lives here, in one function, so those two surfaces cannot drift into quoting
 * different times for the same order.
 */
export function formatTopUpDeadline(
  awaitingConfirmationSince: Date | null,
  windowHours: number,
): string | null {
  const deadline = topUpDeadlineAt(awaitingConfirmationSince, windowHours);
  if (!deadline) return null;
  return `${deadline.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
