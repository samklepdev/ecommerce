/**
 * Signs every customer out.
 *
 * Used when the kill switch closes the store: existing sessions are the one
 * way in that the closed sign-in path doesn't cover, since they were issued
 * before the door shut.
 *
 * Admin sessions are kept, for the same reason `/login` stays open — the
 * console has to remain reachable, and revoking your own session as you
 * close the store would be an unusually direct way to lock yourself out.
 */
export interface CustomerSessionRevoker {
  /** Returns how many sessions were destroyed, for the log and the audit
   * entry. Never throws: failing to sign customers out must not leave the
   * store open, and closing is the more important half of the operation. */
  revokeAllCustomerSessions(): Promise<number>;
}
