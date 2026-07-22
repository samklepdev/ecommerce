export interface CreateEmailVerificationTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface EmailVerificationTokenRecord {
  id: string;
  userId: string;
}

/** Mirrors `PasswordResetRepository`'s exact shape — same token lifecycle. */
export interface EmailVerificationRepository {
  create(input: CreateEmailVerificationTokenInput): Promise<void>;
  findValidByToken(tokenHash: string, now: Date): Promise<EmailVerificationTokenRecord | null>;
  markUsed(id: string): Promise<boolean>;
  invalidateAllForUser(userId: string): Promise<void>;
}
