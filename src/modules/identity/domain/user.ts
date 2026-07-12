import { AggregateRoot } from '@/shared/domain/entity';

export type UserRole = 'customer' | 'admin';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export class User extends AggregateRoot<string> {
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;

  private constructor(props: UserProps) {
    super(props.id);
    this.email = props.email.toLowerCase();
    this.passwordHash = props.passwordHash;
    this.role = props.role ?? 'customer';
  }

  static create(props: UserProps): User {
    if (!props.email.includes('@')) throw new Error(`Invalid email: ${props.email}`);
    return new User(props);
  }

  get isAdmin(): boolean {
    return this.role === 'admin';
  }
}
