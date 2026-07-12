import { ValueObject } from '@/shared/domain/value-object';

interface SessionProps {
  id: string;
  userId: string;
  expiresAt: Date;
}

export class Session extends ValueObject<SessionProps> {
  private constructor(props: SessionProps) {
    super(props);
  }

  static create(props: SessionProps): Session {
    return new Session(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get isExpired(): boolean {
    return this.expiresAt.getTime() <= Date.now();
  }
}
