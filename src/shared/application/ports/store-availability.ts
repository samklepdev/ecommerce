/** Why the store is shut and since when — shown to the operator, never to a
 * customer (a closure reason is an internal note, not a status page). */
export interface StoreClosure {
  closedAt: Date;
  /** Free-text operator note, e.g. "supplier outage". Optional. */
  reason: string | null;
  /** Who flipped it: an admin's email, or `cli` / `token` for the
   * out-of-band triggers that have no session behind them. */
  closedBy: string;
}

/**
 * The kill switch's storage.
 *
 * Redis rather than Postgres or env: it has to be flippable in one command
 * with no deploy and no migration, and readable by a standalone script when
 * the app itself is broken. Absence of the key means open — the store's
 * default state can't depend on a write having succeeded.
 *
 * Reads must not throw. Both callers below have a defined answer for "I
 * couldn't tell", and they differ, so the decision belongs to them:
 * `GetStoreAvailability` treats an unreachable Redis as open, while the
 * checkout guard treats it as closed. See those use cases for why.
 */
export interface StoreAvailabilityStore {
  /** Null means open. Throws only if the backing store is unreachable. */
  read(): Promise<StoreClosure | null>;
  close(closure: StoreClosure): Promise<void>;
  open(): Promise<void>;
}
