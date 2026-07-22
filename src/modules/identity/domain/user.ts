import { AggregateRoot } from '@/shared/domain/entity';

export type UserRole = 'customer' | 'admin';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  avatarUrl?: string | null;
  emailVerifiedAt?: Date | null;
}

export class User extends AggregateRoot<string> {
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly avatarUrl: string | null;
  readonly emailVerifiedAt: Date | null;

  private constructor(props: UserProps) {
    super(props.id);
    this.email = props.email.toLowerCase();
    this.passwordHash = props.passwordHash;
    this.role = props.role ?? 'customer';
    this.avatarUrl = props.avatarUrl ?? null;
    this.emailVerifiedAt = props.emailVerifiedAt ?? null;
  }

  static create(props: UserProps): User {
    if (!props.email.includes('@')) throw new Error(`Invalid email: ${props.email}`);
    return new User(props);
  }

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null;
  }
}
