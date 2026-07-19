import { and, eq, gt, isNull } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { passwordResetTokens } from '@/shared/infrastructure/db/schema';
import type {
  CreatePasswordResetTokenInput,
  PasswordResetRepository,
  PasswordResetTokenRecord,
} from '@/modules/identity/application/ports/password-reset-repository';

export class DrizzlePasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly db: DB) {}

  async create(input: CreatePasswordResetTokenInput): Promise<void> {
    await this.db.insert(passwordResetTokens).values({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  async findValidByToken(tokenHash: string, now: Date): Promise<PasswordResetTokenRecord | null> {
    const row = await this.db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    });
    if (!row) return null;
    return { id: row.id, userId: row.userId };
  }

  async markUsed(id: string): Promise<boolean> {
    const result = await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    return result.length > 0;
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  }
}
