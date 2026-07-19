import { AggregateRoot } from '@/shared/domain/entity';

export interface PasswordResetTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
}

export class PasswordResetToken extends AggregateRoot<string> {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;

  private constructor(props: PasswordResetTokenProps) {
    super(props.id);
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt ?? null;
  }

  static create(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
  }

  get isUsed(): boolean {
    return this.usedAt !== null;
  }
}
