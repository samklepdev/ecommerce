import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { hashPassword } from '@/shared/infrastructure/password-hash';
import { User } from '@/modules/identity/domain/user';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface SignUpInput {
  email: string;
  password: string;
}

export type SignUpError = { code: 'email_taken' };

export class SignUp implements UseCase<SignUpInput, Result<User, SignUpError>> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: SignUpInput): Promise<Result<User, SignUpError>> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) return err({ code: 'email_taken' });

    const passwordHash = await hashPassword(input.password);
    const user = User.create({ id: randomUUID(), email: input.email, passwordHash });
    await this.users.create(user);
    return ok(user);
  }
}
