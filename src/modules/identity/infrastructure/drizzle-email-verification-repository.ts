import { and, eq, gt, isNull } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { emailVerificationTokens } from '@/shared/infrastructure/db/schema';
import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationRepository,
  EmailVerificationTokenRecord,
} from '@/modules/identity/application/ports/email-verification-repository';

/** Mirrors `DrizzlePasswordResetRepository` exactly. */
export class DrizzleEmailVerificationRepository implements EmailVerificationRepository {
  constructor(private readonly db: DB) {}

  async create(input: CreateEmailVerificationTokenInput): Promise<void> {
    await this.db.insert(emailVerificationTokens).values({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  async findValidByToken(tokenHash: string, now: Date): Promise<EmailVerificationTokenRecord | null> {
    const row = await this.db.query.emailVerificationTokens.findFirst({
      where: and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, now),
      ),
    });
    if (!row) return null;
    return { id: row.id, userId: row.userId };
  }

  async markUsed(id: string): Promise<boolean> {
    const result = await this.db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailVerificationTokens.id, id), isNull(emailVerificationTokens.usedAt)))
      .returning({ id: emailVerificationTokens.id });
    return result.length > 0;
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
  }
}
