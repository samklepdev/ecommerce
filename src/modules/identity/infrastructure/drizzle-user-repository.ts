import { eq, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { users } from '@/shared/infrastructure/db/schema';
import { User, type UserRole } from '@/modules/identity/domain/user';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): User {
  return User.create({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role as UserRole,
  });
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DB) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({
      where: sql`lower(${users.email}) = lower(${email})`,
    });
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({ where: eq(users.id, id) });
    return row ? toUser(row) : null;
  }

  async create(user: User): Promise<void> {
    await this.db.insert(users).values({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
    });
  }
}
