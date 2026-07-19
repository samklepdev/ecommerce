import type { UseCase } from '@/shared/application/use-case';
import type { UserProfile, UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface GetAccountProfileInput {
  userId: string;
}

export class GetAccountProfile implements UseCase<GetAccountProfileInput, UserProfile | null> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: GetAccountProfileInput): Promise<UserProfile | null> {
    return this.users.findProfileById(input.userId);
  }
}
