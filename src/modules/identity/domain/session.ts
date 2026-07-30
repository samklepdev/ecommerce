import { ValueObject } from '@/shared/domain/value-object';

interface SessionProps {
  id: string;
  userId: string;
  /** Hard ceiling. A session never outlives this, however active it is. */
  expiresAt: Date;
  /** Last request this session was seen on — where the idle clock starts. */
  lastSeenAt: Date;
  /** How long the session may sit unused before it dies, independently of
   * `expiresAt`. Chosen at login from the account's role, so an admin
   * console left open in a coffee shop stops being a way in long before a
   * customer's 30-day cookie does. */
  idleTimeoutSeconds: number;
  /** When the password was last actually typed. Destructive admin actions
   * require this to be recent, so a borrowed unlocked laptop can browse the
   * console without being able to refund, promote or delete. */
  reauthenticatedAt: Date;
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

  get lastSeenAt(): Date {
    return this.props.lastSeenAt;
  }

  get idleTimeoutSeconds(): number {
    return this.props.idleTimeoutSeconds;
  }

  get reauthenticatedAt(): Date {
    return this.props.reauthenticatedAt;
  }

  /** Past its hard ceiling. */
  isExpiredAt(now: Date = new Date()): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  /** Unused for longer than its idle window. */
  isIdleAt(now: Date = new Date()): boolean {
    return now.getTime() - this.lastSeenAt.getTime() > this.idleTimeoutSeconds * 1000;
  }

  /** Either clock running out ends the session. */
  isValidAt(now: Date = new Date()): boolean {
    return !this.isExpiredAt(now) && !this.isIdleAt(now);
  }

  /** Was the password typed within `windowSeconds`? */
  hasRecentAuthAt(windowSeconds: number, now: Date = new Date()): boolean {
    return now.getTime() - this.reauthenticatedAt.getTime() <= windowSeconds * 1000;
  }

  /** Whole seconds left on the hard ceiling — what a sliding TTL is capped
   * against, so refreshing activity can never push a session past its
   * absolute end. */
  secondsUntilExpiry(now: Date = new Date()): number {
    return Math.max(0, Math.ceil((this.expiresAt.getTime() - now.getTime()) / 1000));
  }

  /** The absolute clock only. Kept because callers that predate the idle
   * clock mean exactly this; new code should ask `isValidAt`. */
  get isExpired(): boolean {
    return this.isExpiredAt();
  }
}
