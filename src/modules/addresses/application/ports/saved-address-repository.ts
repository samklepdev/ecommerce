import type { SavedAddress } from '@/modules/addresses/domain/saved-address';

export interface SavedAddressFields {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

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
  /** Edits the address fields only — never touches `isDefault`/`createdAt`.
   * Same ownership-scoped-in-query, guarded/idempotent shape as `delete`. */
  update(id: string, userId: string, details: SavedAddressFields): Promise<boolean>;
}
