import { AggregateRoot } from '@/shared/domain/entity';

export interface WelcomeEmailProps {
  id: string;
  userId: string;
  trackingToken: string;
  sentAt: Date;
  openedAt?: Date | null;
}

export class WelcomeEmail extends AggregateRoot<string> {
  readonly userId: string;
  readonly trackingToken: string;
  readonly sentAt: Date;
  readonly openedAt: Date | null;

  private constructor(props: WelcomeEmailProps) {
    super(props.id);
    this.userId = props.userId;
    this.trackingToken = props.trackingToken;
    this.sentAt = props.sentAt;
    this.openedAt = props.openedAt ?? null;
  }

  static create(props: WelcomeEmailProps): WelcomeEmail {
    return new WelcomeEmail(props);
  }

  get isOpened(): boolean {
    return this.openedAt !== null;
  }
}
