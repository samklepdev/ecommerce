import type { SavedAddress } from '@/modules/addresses/domain/saved-address';

export interface SavedAddressRepository {
  listForUser(userId: string): Promise<SavedAddress[]>;
  create(address: SavedAddress): Promise<void>;
  /** Ownership-scoped in the query itself, not fetch-then-check — same
   * convention as everywhere else in this codebase. Guarded/idempotent:
   * false if no row matched (wrong id or wrong owner). */
  delete(id: string, userId: string): Promise<boolean>;
  /** Unsets any other default for the user and sets this one, in a single
   * transaction. False if no row matched (wrong id or wrong owner). */
  setDefault(id: string, userId: string): Promise<boolean>;
}
