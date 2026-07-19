export interface CreatePasswordResetTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
}

export interface PasswordResetRepository {
  create(input: CreatePasswordResetTokenInput): Promise<void>;
  /** Unexpired AND unused only — `now` is passed in rather than compared
   * DB-side, for testability (mirrors `expire-stale-checkouts.ts`'s
   * convention). */
  findValidByToken(tokenHash: string, now: Date): Promise<PasswordResetTokenRecord | null>;
  /** Guarded + idempotent: false if already used. */
  markUsed(id: string): Promise<boolean>;
  /** Marks every currently-unused token for a user as used — called when a
   * new reset is requested, so only the most recently issued link is ever
   * live. */
  invalidateAllForUser(userId: string): Promise<void>;
}
