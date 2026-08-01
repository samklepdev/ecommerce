/**
 * Which entry of `x-forwarded-for` is actually the client.
 *
 * The header is a list, and **the client controls the left-hand end of it**.
 * A proxy appends the address it received the connection from, so under the
 * standard nginx recipe (`proxy_set_header X-Forwarded-For
 * $proxy_add_x_forwarded_for`) a request arriving with `X-Forwarded-For:
 * 1.2.3.4` leaves the proxy as `1.2.3.4, <real client>`.
 *
 * Reading `split(',')[0]` therefore returned whatever the caller typed. Two
 * consequences, both live:
 *
 *   * every per-IP limit was bypassable by rotating a header — including the
 *     login limiter, and the checkout limiter that gates address-index
 *     consumption;
 *   * and pointing that header at *someone else's* IP burned their budget
 *     instead, so a few dozen requests could lock a chosen victim out of
 *     logging in.
 *
 * Counting from the right fixes both, because only the proxies append and each
 * one appends the peer it actually saw. With `trustedHops` proxies in front of
 * the app, the client sits at `length - trustedHops`: anything further left is
 * caller-supplied and must be ignored.
 */
export function clientIpFromForwardedFor(
  forwardedFor: string | null,
  trustedHops: number,
): string | null {
  /**
   * No proxy in front means the header is pure hearsay — nothing appended it,
   * so every entry is whatever the client chose to send. Ignored entirely
   * rather than half-trusted.
   */
  if (trustedHops <= 0) return null;
  if (!forwardedFor) return null;

  const entries = forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return null;

  /**
   * Fewer entries than configured hops means the request did not traverse the
   * proxies we expect — a bypassed proxy, a misconfiguration, or a direct hit
   * on the app port. Unidentifiable rather than clamped to the leftmost entry:
   * clamping would resolve to a caller-supplied value in exactly the case
   * where the chain can't be vouched for, which is the bug this exists to fix.
   *
   * Equal lengths are the normal case — one proxy, one appended address.
   */
  if (entries.length < trustedHops) return null;

  return entries[entries.length - trustedHops] ?? null;
}
