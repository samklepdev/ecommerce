import { and, eq, isNull } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { welcomeEmails } from '@/shared/infrastructure/db/schema';
import type {
  CreateWelcomeEmailInput,
  WelcomeEmailRepository,
  WelcomeEmailStatus,
} from '@/modules/notifications/application/ports/welcome-email-repository';

export class DrizzleWelcomeEmailRepository implements WelcomeEmailRepository {
  constructor(private readonly db: DB) {}

  async create(input: CreateWelcomeEmailInput): Promise<void> {
    await this.db.insert(welcomeEmails).values({
      id: input.id,
      userId: input.userId,
      trackingToken: input.trackingToken,
    });
  }

  async findByUserId(userId: string): Promise<WelcomeEmailStatus | null> {
    const row = await this.db.query.welcomeEmails.findFirst({
      where: eq(welcomeEmails.userId, userId),
    });
    if (!row) return null;
    return { sentAt: row.sentAt, openedAt: row.openedAt };
  }

  async markOpened(trackingToken: string): Promise<boolean> {
    const result = await this.db
      .update(welcomeEmails)
      .set({ openedAt: new Date() })
      .where(and(eq(welcomeEmails.trackingToken, trackingToken), isNull(welcomeEmails.openedAt)))
      .returning({ id: welcomeEmails.id });
    return result.length > 0;
  }
}
